import type {
  AgentKind,
  ClaudeSettingsLayer,
  CodexConfig,
  RootSnapshot,
  ScanRoot,
  SkillRecord,
  SkillStatus,
} from './types';
import { parseSkillDir } from './parse-skill';
import { pathHash } from './plan-ops';

/** Codex 条目路径归一化为技能目录形式（R2：历史目录写法与 SKILL.md 写法并存） */
export function normalizeCodexEntryPath(p: string): string {
  let t = p.replace(/\/+$/, '');
  if (t.endsWith('/SKILL.md')) t = t.slice(0, -'/SKILL.md'.length);
  return t;
}

/** R2 实测：只有 SKILL.md 形式的条目真正生效；目录形式是死条目 */
export function isEffectiveCodexEntry(rawPath: string): boolean {
  return rawPath.replace(/\/+$/, '').endsWith('/SKILL.md');
}

const CLAUDE_STATUSES: SkillStatus[] = ['on', 'name-only', 'user-invocable-only', 'off'];

function claudeStatusFor(
  name: string,
  layers: ClaudeSettingsLayer[],
): { status: SkillStatus; source: string | null } {
  // 合并顺序：传入时按优先级升序（user → project → local），后者覆盖前者
  let status: SkillStatus = 'on';
  let source: string | null = null;
  for (const layer of layers) {
    if (layer.overrides === null) continue; // 解析失败的层不参与（该层文件已由 corrupt 列表标记）
    const v = layer.overrides[name];
    if (v !== undefined && CLAUDE_STATUSES.includes(v as SkillStatus)) {
      status = v as SkillStatus;
      source = layer.path;
    }
  }
  return { status, source };
}

export interface ResolveInput {
  snapshots: { root: ScanRoot; snap: RootSnapshot }[];
  /** 每个 Claude 根适用的 settings 层（按优先级升序） */
  claudeLayersFor: (root: ScanRoot) => ClaudeSettingsLayer[];
  codexConfig: CodexConfig;
}

export interface ResolveOutput {
  records: SkillRecord[];
  /** 解析失败、需降级只读提示的配置文件路径 */
  corruptConfigs: string[];
}

export function resolveStates(input: ResolveInput): ResolveOutput {
  const records: SkillRecord[] = [];
  const corrupt = new Set<string>();

  const codexEntries = input.codexConfig.entries;
  if (codexEntries === null) corrupt.add(input.codexConfig.path);

  const codexByDir = new Map<string, { enabled: boolean | null; allowImplicit: boolean | null }>();
  for (const e of codexEntries ?? []) {
    if (!isEffectiveCodexEntry(e.rawPath)) continue; // 死条目不当作禁用
    codexByDir.set(normalizeCodexEntryPath(e.rawPath), {
      enabled: e.enabled,
      allowImplicit: e.allowImplicitInvocation,
    });
  }

  for (const { root, snap } of input.snapshots) {
    if (!snap.exists) continue;

    if (root.agent === 'claude') {
      const layers = input.claudeLayersFor(root);
      for (const l of layers) if (l.overrides === null) corrupt.add(l.path);
      for (const d of snap.skills) {
        const parsed = parseSkillDir(d.dir_name, d.skill_md_head);
        const { status, source } = claudeStatusFor(parsed.name, layers);
        records.push(makeRecord('claude', root, d, parsed.name, parsed.description, {
          status,
          statusSource: source,
          allowImplicitInvocation: true,
          sizeBytes: d.size_bytes,
          fileCount: d.file_count,
          parseError: parsed.parseError,
          strayFile: false,
        }));
      }
    } else {
      for (const d of snap.skills) {
        const parsed = parseSkillDir(d.dir_name, d.skill_md_head);
        const entry = codexByDir.get(d.dir_path.replace(/\/+$/, ''));
        const status: SkillStatus = entry?.enabled === false ? 'off' : 'on';
        records.push(makeRecord('codex', root, d, parsed.name, parsed.description, {
          status,
          statusSource: entry ? input.codexConfig.path : null,
          allowImplicitInvocation: entry?.allowImplicit !== false,
          sizeBytes: d.size_bytes,
          fileCount: d.file_count,
          parseError: parsed.parseError,
          strayFile: false,
        }));
      }
    }

    for (const f of snap.stray_files) {
      records.push(makeRecord(root.agent, root, { dir_path: f.path, real_path: f.path, is_symlink: false, skill_md_head: null }, f.name, null, {
        status: 'on',
        statusSource: null,
        allowImplicitInvocation: true,
        sizeBytes: f.size_bytes,
        fileCount: 1,
        parseError: false,
        strayFile: true,
      }));
    }
  }

  detectDuplicates(records);
  return { records, corruptConfigs: [...corrupt] };
}

function makeRecord(
  agent: AgentKind,
  root: ScanRoot,
  d: Pick<import('./types').DirEntrySnapshot, 'dir_path' | 'real_path' | 'is_symlink' | 'skill_md_head'>,
  name: string,
  description: string | null,
  rest: {
    status: SkillStatus;
    statusSource: string | null;
    allowImplicitInvocation: boolean;
    sizeBytes: number;
    fileCount: number;
    parseError: boolean;
    strayFile: boolean;
  },
): SkillRecord {
  return {
    id: `${agent}:${d.dir_path}`,
    agent,
    scope: root.scope,
    dirPath: d.dir_path,
    realPath: d.real_path,
    isSymlink: d.is_symlink,
    contentKey: d.skill_md_head === null ? '' : pathHash(d.skill_md_head),
    name,
    description,
    status: rest.status,
    statusSource: rest.statusSource,
    allowImplicitInvocation: rest.allowImplicitInvocation,
    sizeBytes: rest.sizeBytes,
    fileCount: rest.fileCount,
    flags: {
      duplicate: false,
      conflict: false,
      strayFile: rest.strayFile,
      parseError: rest.parseError,
      locked: root.scope.kind === 'bundled',
      statusLocked: false,
    },
  };
}

function isStoreUser(r: SkillRecord): boolean {
  return r.scope.kind === 'user' && r.scope.root.endsWith('/.agents/skills');
}

/**
 * 重复语义（运行时可见性版）：冲突只在"同一运行时会同时加载两份"时才有意义。
 * - 项目级 vs 对应用户级（claude → ~/.claude/skills；codex → ~/.codex/skills + Store）：
 *   同名内容分叉 → conflict；同名 SKILL.md 一致 → duplicate（冗余拷贝）。只标项目级记录。
 * - ~/.codex/skills vs Store（Codex 同时加载两者）：同名内容分叉 → conflict，只标 ~/.codex/skills 侧。
 * - Claude 用户级 vs Store 同名无所谓（Claude 不读 Store）；名字不同即不同技能；
 *   软链同实体（realPath 相同）永不标记。
 */
export function detectDuplicates(records: SkillRecord[]): SkillRecord[] {
  const key = (r: SkillRecord) => `${r.agent}:${r.name.trim().toLowerCase()}`;
  const userByKey = new Map<string, SkillRecord[]>();
  for (const r of records) {
    if (!r.flags.strayFile && r.scope.kind === 'user') push(userByKey, key(r), r);
  }

  const flagged: SkillRecord[] = [];
  for (const r of records) {
    if (r.flags.strayFile) continue;
    const peers = (userByKey.get(key(r)) ?? []).filter(
      (p) => p !== r && p.realPath !== r.realPath,
    );
    if (peers.length === 0) continue;

    if (r.scope.kind === 'project') {
      if (peers.some((p) => p.contentKey !== r.contentKey)) r.flags.conflict = true;
      else r.flags.duplicate = true;
      flagged.push(r);
    } else if (r.scope.kind === 'user' && r.agent === 'codex' && !isStoreUser(r)) {
      if (peers.some((p) => isStoreUser(p) && p.contentKey !== r.contentKey)) {
        r.flags.conflict = true;
        flagged.push(r);
      }
    }
  }
  return flagged;
}

function push<K>(m: Map<K, SkillRecord[]>, k: K, v: SkillRecord) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}
