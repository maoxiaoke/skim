// 全量刷新编排：项目发现 → 扫描 → 配置读取 → 领域层求解
import { homeDir } from '@tauri-apps/api/path';
import type {
  AgentKind,
  ArchiveManifest,
  ClaudeSettingsLayer,
  ProjectCandidate,
  RootSnapshot,
  ScanRoot,
  SkimConfig,
  SkillRecord,
} from '../domain/types';
import { DEFAULT_SKIM_CONFIG } from '../domain/types';
import { parseCodexSessionIndex, discoverProjects } from '../domain/discover-projects';
import { parseSkillDir } from '../domain/parse-skill';
import { pathHash } from '../domain/plan-ops';
import { resolveStates } from '../domain/resolve-state';
import type { CodexPluginEntryOut, InstalledPluginOut } from './tauri';
import { ipc } from './tauri';

export interface ArchiveItem {
  manifest: ArchiveManifest;
  archiveDir: string;
  manifestPath: string;
  present: boolean;
}

export interface RefreshResult {
  home: string;
  config: SkimConfig;
  projects: (ProjectCandidate & { skillCount: number })[];
  records: SkillRecord[];
  corruptConfigs: string[];
  archive: ArchiveItem[];
  refreshedAt: number;
}

export async function getHome(): Promise<string> {
  const h = await homeDir();
  return h.replace(/\/+$/, '');
}

export async function loadSkimConfig(home: string): Promise<SkimConfig> {
  const [file] = await ipc.readTextFiles([`${home}/.skim/config.json`]);
  if (!file.content) return DEFAULT_SKIM_CONFIG;
  try {
    return { ...DEFAULT_SKIM_CONFIG, ...(JSON.parse(file.content) as Partial<SkimConfig>) };
  } catch {
    return DEFAULT_SKIM_CONFIG;
  }
}

async function discover(home: string, cfg: SkimConfig): Promise<ProjectCandidate[]> {
  const [claudeNames, sessionFiles] = await Promise.all([
    ipc.listDirNames(`${home}/.claude/projects`).catch(() => [] as string[]),
    ipc.readTextFiles([`${home}/.codex/session_index.jsonl`]),
  ]);
  const decoded = (await ipc.decodeProjectDirs(claudeNames))
    .map((d) => d.decoded)
    .filter((d): d is string => d !== null);

  const codexCwds = sessionFiles[0].content
    ? parseCodexSessionIndex(sessionFiles[0].content)
    : [];
  const codexExist = codexCwds.length ? await ipc.dirsExist(codexCwds) : [];
  const codexExisting = codexCwds.filter((_, i) => codexExist[i]);

  // 手动项目也要校验存在性（PRD US-7）
  const candidates = discoverProjects(decoded, codexExisting, cfg);
  const exist = candidates.length ? await ipc.dirsExist(candidates.map((c) => c.path)) : [];
  // home 本身可能被会话记录捕获为 cwd，不算项目
  return candidates.filter((c, i) => exist[i] && c.path !== home);
}

function buildRoots(home: string, projects: ProjectCandidate[]): ScanRoot[] {
  const roots: ScanRoot[] = [
    { agent: 'claude', scope: { kind: 'user', root: `${home}/.claude/skills` } },
    { agent: 'codex', scope: { kind: 'user', root: `${home}/.codex/skills` } },
    { agent: 'codex', scope: { kind: 'user', root: `${home}/.agents/skills` } },
    { agent: 'codex', scope: { kind: 'bundled', root: `${home}/.codex/skills/.system` } },
  ];
  for (const p of projects) {
    roots.push({
      agent: 'claude',
      scope: { kind: 'project', root: `${p.path}/.claude/skills`, project: p.path },
    });
    roots.push({
      agent: 'codex',
      scope: { kind: 'project', root: `${p.path}/.agents/skills`, project: p.path },
    });
  }
  return roots;
}

interface PluginScanMeta {
  agent: AgentKind;
  pluginKey: string;
  version: string;
  pluginEnabled: boolean;
  installScope: 'user' | 'project';
  projectPath?: string;
}

function parseEnabledPlugins(content: string | null): Record<string, boolean> {
  if (!content || content.trim() === '') return {};
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const ep = parsed['enabledPlugins'];
    if (!ep || typeof ep !== 'object' || Array.isArray(ep)) return {};
    const result: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(ep as Record<string, unknown>)) {
      if (typeof v === 'boolean') result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

function buildPluginScanRoots(
  claudePlugins: InstalledPluginOut[],
  enabledPlugins: Record<string, boolean>,
  codexPlugins: CodexPluginEntryOut[],
): { meta: PluginScanMeta; root: string }[] {
  const result: { meta: PluginScanMeta; root: string }[] = [];
  for (const p of claudePlugins) {
    result.push({
      meta: {
        agent: 'claude',
        pluginKey: p.key,
        version: p.version || '?',
        pluginEnabled: enabledPlugins[p.key] !== false,
        installScope: p.scope === 'project' ? 'project' : 'user',
        projectPath: p.project_path ?? undefined,
      },
      root: `${p.install_path}/skills`,
    });
  }
  for (const p of codexPlugins) {
    if (!p.install_path) continue;
    result.push({
      meta: {
        agent: 'codex',
        pluginKey: p.plugin_key,
        version: p.version ?? '?',
        pluginEnabled: p.enabled !== false,
        installScope: 'user',
      },
      root: `${p.install_path}/skills`,
    });
  }
  return result;
}

function buildPluginRecords(
  pluginRoots: { meta: PluginScanMeta; root: string }[],
  snaps: RootSnapshot[],
): SkillRecord[] {
  const records: SkillRecord[] = [];
  for (let i = 0; i < pluginRoots.length; i++) {
    const { meta } = pluginRoots[i];
    const snap = snaps[i];
    if (!snap?.exists) continue;
    const scope = {
      kind: 'plugin' as const,
      root: snap.root,
      pluginKey: meta.pluginKey,
      version: meta.version,
      pluginEnabled: meta.pluginEnabled,
      installScope: meta.installScope,
      ...(meta.projectPath ? { projectPath: meta.projectPath } : {}),
    };
    for (const d of snap.skills) {
      const parsed = parseSkillDir(d.dir_name, d.skill_md_head);
      records.push({
        id: `plugin:${meta.pluginKey}:${d.dir_path}`,
        agent: meta.agent,
        scope,
        dirPath: d.dir_path,
        realPath: d.real_path,
        isSymlink: d.is_symlink,
        contentKey: d.skill_md_head === null ? '' : pathHash(d.skill_md_head),
        name: parsed.name,
        description: parsed.description,
        status: meta.pluginEnabled ? 'on' : 'off',
        statusSource: null,
        allowImplicitInvocation: true,
        sizeBytes: d.size_bytes,
        fileCount: d.file_count,
        flags: {
          duplicate: false,
          conflict: false,
          strayFile: false,
          parseError: parsed.parseError,
          locked: true,
          statusLocked: true,
        },
      });
    }
  }
  return records;
}

function parseOverrides(content: string | null): Record<string, string> | null {
  if (content === null || content.trim() === '') return {};
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const o = parsed['skillOverrides'];
    if (o === undefined || o === null) return {};
    if (typeof o !== 'object' || Array.isArray(o)) return {};
    return o as Record<string, string>;
  } catch {
    return null; // 解析失败 → 该层降级
  }
}

export async function refreshAll(): Promise<RefreshResult> {
  const home = await getHome();
  const config = await loadSkimConfig(home);
  const projects = await discover(home, config);
  const roots = buildRoots(home, projects);

  // Claude settings 路径集合
  const userSettings = `${home}/.claude/settings.json`;
  const projectSettingsPaths = projects.flatMap((p) => [
    `${p.path}/.claude/settings.json`,
    `${p.path}/.claude/settings.local.json`,
  ]);

  const [snaps, settingsFiles, codexConfig, archiveRaw, claudePlugins] = await Promise.all([
    ipc.scanSkillDirs(roots.map((r) => r.scope.root)),
    ipc.readTextFiles([userSettings, ...projectSettingsPaths]),
    ipc.readCodexConfig(`${home}/.codex/config.toml`),
    ipc.listArchive(`${home}/.skim/archive`),
    ipc.readClaudeInstalledPlugins(home),
  ]);

  const overridesByPath = new Map<string, Record<string, string> | null>();
  for (const f of settingsFiles) {
    // 文件不存在（error 且无 content）算空层而非损坏
    overridesByPath.set(f.path, f.error && f.content === null && !f.error.includes('JSON')
      ? {}
      : parseOverrides(f.content));
  }

  const claudeLayersFor = (root: ScanRoot): ClaudeSettingsLayer[] => {
    const layers: ClaudeSettingsLayer[] = [
      { path: userSettings, overrides: overridesByPath.get(userSettings) ?? {} },
    ];
    if (root.scope.kind === 'project') {
      const proj = root.scope.project;
      for (const suffix of ['settings.json', 'settings.local.json']) {
        const p = `${proj}/.claude/${suffix}`;
        layers.push({ path: p, overrides: overridesByPath.get(p) ?? {} });
      }
    }
    return layers;
  };

  const snapshots = roots.map((root, i) => ({ root, snap: snaps[i] as RootSnapshot }));
  const { records: regularRecords, corruptConfigs } = resolveStates({
    snapshots,
    claudeLayersFor,
    codexConfig: {
      path: codexConfig.path,
      entries:
        codexConfig.entries?.map((e) => ({
          rawPath: e.raw_path,
          enabled: e.enabled,
          allowImplicitInvocation: e.allow_implicit_invocation,
        })) ?? null,
    },
  });

  const enabledPlugins = parseEnabledPlugins(settingsFiles[0].content);
  const pluginScanRoots = buildPluginScanRoots(claudePlugins, enabledPlugins, codexConfig.plugins ?? []);
  const pluginSnaps: RootSnapshot[] = pluginScanRoots.length
    ? await ipc.scanSkillDirs(pluginScanRoots.map((r) => r.root))
    : [];
  const pluginRecords = buildPluginRecords(pluginScanRoots, pluginSnaps);

  const records = [...regularRecords, ...pluginRecords];

  const archive: ArchiveItem[] = [];
  for (const a of archiveRaw) {
    try {
      archive.push({
        manifest: JSON.parse(a.manifest_raw) as ArchiveManifest,
        archiveDir: a.archive_dir,
        manifestPath: a.manifest_path,
        present: a.present,
      });
    } catch {
      // 损坏 manifest 跳过
    }
  }

  const countByProject = new Map<string, number>();
  for (const r of records) {
    if (r.scope.kind === 'project') {
      countByProject.set(r.scope.project, (countByProject.get(r.scope.project) ?? 0) + 1);
    }
  }

  return {
    home,
    config,
    projects: projects
      .map((p) => ({ ...p, skillCount: countByProject.get(p.path) ?? 0 }))
      .sort((a, b) => b.skillCount - a.skillCount || a.path.localeCompare(b.path)),
    records,
    corruptConfigs,
    archive,
    refreshedAt: Date.now(),
  };
}
