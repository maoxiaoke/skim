// 全量刷新编排：项目发现 → 扫描 → 配置读取 → 领域层求解
import { homeDir } from '@tauri-apps/api/path';
import type {
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
import { resolveStates } from '../domain/resolve-state';
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

  const [snaps, settingsFiles, codexConfig, archiveRaw] = await Promise.all([
    ipc.scanSkillDirs(roots.map((r) => r.scope.root)),
    ipc.readTextFiles([userSettings, ...projectSettingsPaths]),
    ipc.readCodexConfig(`${home}/.codex/config.toml`),
    ipc.listArchive(`${home}/.skim/archive`),
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
  const { records, corruptConfigs } = resolveStates({
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
