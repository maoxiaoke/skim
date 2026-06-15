import { create } from 'zustand';
import type {
  AgentKind,
  OpPlan,
  ProjectCandidate,
  SkimConfig,
  SkillRecord,
  SkillStatus,
} from './domain/types';
import { DEFAULT_SKIM_CONFIG } from './domain/types';
import {
  planArchive,
  planDelete,
  planRestore,
  planSetAllowImplicit,
  planSetStatus,
  planTogglePlugin,
} from './domain/plan-ops';
import type { ArchiveItem, RefreshResult } from './io/refresh';
import { refreshAll } from './io/refresh';
import { executePlans, type PlanResult } from './io/execute';
import { ipc } from './io/tauri';
import { checkForUpdate, downloadAndInstall, type UpdateInfo } from './io/updater';

export type View = 'skills' | 'archive' | 'settings';
export type StatusFilter = 'all' | 'on' | 'off' | 'issues';
export type AgentFilter = 'claude' | 'codex' | 'store' | `project:${string}`;

/** ~/.agents/skills —— npx skills 的中央总仓（Codex 直读，Claude 不读） */
export function isStoreRecord(r: SkillRecord): boolean {
  return r.scope.kind === 'user' && r.scope.root.endsWith('/.agents/skills');
}

export interface PendingConfirm {
  kind: 'archive' | 'delete';
  danger: boolean;
  /** 逐项清单 —— 由 ConfirmDialog 渲染为限高滚动列表（文案也在那边走 i18n） */
  items: { name: string; sizeBytes: number }[];
  /** Store 实体的强提示：Codex 正在加载的数量 + 将被一并清理的软链路径 */
  warnings?: { codexLoadedCount: number; brokenLinks: string[] };
  plans: OpPlan[];
}

interface SkimState {
  loading: boolean;
  error: string | null;
  home: string;
  config: SkimConfig;
  records: SkillRecord[];
  projects: (ProjectCandidate & { skillCount: number })[];
  archive: ArchiveItem[];
  corruptConfigs: string[];
  refreshedAt: number | null;

  view: View;
  search: string;
  statusFilter: StatusFilter;
  agentFilter: AgentFilter;
  selectedId: string | null;
  batchMode: boolean;
  checked: Set<string>;
  confirm: PendingConfirm | null;
  lastResults: PlanResult[] | null;
  /** 批量执行中：全屏遮罩 + 进度，期间禁止页面操作 */
  busy: { kind: 'archive' | 'delete' | 'status'; done: number; total: number } | null;
  sidebarCollapsed: boolean;

  refresh: () => Promise<void>;
  toggleSidebar: () => void;
  setView: (v: View) => void;
  setSearch: (s: string) => void;
  setStatusFilter: (f: StatusFilter) => void;
  setAgentFilter: (f: AgentFilter) => void;
  select: (id: string | null) => void;
  toggleBatch: () => void;
  toggleChecked: (id: string) => void;
  checkAll: (ids: string[]) => void;

  setStatus: (rec: SkillRecord, to: SkillStatus) => Promise<void>;
  batchSetStatus: (recs: SkillRecord[], to: 'on' | 'off') => Promise<void>;
  setAllowImplicit: (rec: SkillRecord, allow: boolean) => Promise<void>;
  requestArchive: (recs: SkillRecord[]) => void;
  requestDelete: (recs: SkillRecord[]) => void;
  restore: (item: ArchiveItem, mode: 'fail' | 'overwrite' | 'rename') => Promise<PlanResult>;
  deleteArchived: (item: ArchiveItem) => Promise<void>;
  confirmAccept: () => Promise<void>;
  confirmCancel: () => void;

  togglePlugin: (agent: AgentKind, pluginKey: string, enabled: boolean) => Promise<void>;

  addProject: (path: string) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  updateConfig: (patch: Partial<SkimConfig>) => Promise<void>;

  update: UpdateInfo | null;
  updateDismissed: boolean;
  updateInstalling: boolean;
  checkUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  installUpdate: () => Promise<void>;
}

function ctx(home: string) {
  return { home, nowIso: new Date().toISOString() };
}

/**
 * Store 实体的删除/归档影响评估：找出指向各实体的软链安装（将变废链，连带清理），
 * 并统计 Codex 正在加载的数量，供确认弹窗强提示。非 Store 记录不受影响。
 */
function withStoreImpact(
  all: SkillRecord[],
  recs: SkillRecord[],
  makePlan: (r: SkillRecord, links: SkillRecord[]) => OpPlan,
): { plans: OpPlan[]; warnings?: PendingConfirm['warnings'] } {
  const brokenLinks: string[] = [];
  let codexLoadedCount = 0;
  const plans = recs.map((r) => {
    if (!isStoreRecord(r)) return makePlan(r, []);
    const links = all.filter((x) => x.id !== r.id && x.isSymlink && x.realPath === r.realPath);
    brokenLinks.push(...links.map((l) => l.dirPath));
    if (r.status !== 'off') codexLoadedCount += 1;
    return makePlan(r, links);
  });
  const hasImpact = brokenLinks.length > 0 || codexLoadedCount > 0;
  return { plans, warnings: hasImpact ? { codexLoadedCount, brokenLinks } : undefined };
}

/** 批量执行的统一护栏：全屏 busy 遮罩 + 进度推进 + 兜底解锁 + 单次刷新 */
async function runGuarded(
  set: (p: Partial<SkimState> | ((s: SkimState) => Partial<SkimState>)) => void,
  get: () => SkimState,
  kind: NonNullable<SkimState['busy']>['kind'],
  plans: OpPlan[],
) {
  set({ busy: { kind, done: 0, total: plans.length } });
  try {
    const results = await executePlans(plans, (done) =>
      set((s) => (s.busy ? { busy: { ...s.busy, done } } : {})),
    );
    set({ lastResults: results, batchMode: false, checked: new Set() });
  } finally {
    set({ busy: null });
    await get().refresh();
  }
}

export const useSkim = create<SkimState>((set, get) => ({
  loading: false,
  error: null,
  home: '',
  config: DEFAULT_SKIM_CONFIG,
  records: [],
  projects: [],
  archive: [],
  corruptConfigs: [],
  refreshedAt: null,

  view: 'skills',
  search: '',
  statusFilter: 'all',
  agentFilter: 'claude',
  selectedId: null,
  batchMode: false,
  checked: new Set(),
  confirm: null,
  lastResults: null,
  busy: null,
  sidebarCollapsed: false,

  update: null,
  updateDismissed: false,
  updateInstalling: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const r: RefreshResult = await refreshAll();
      set({
        home: r.home,
        config: r.config,
        records: r.records,
        projects: r.projects,
        archive: r.archive,
        corruptConfigs: r.corruptConfigs,
        refreshedAt: r.refreshedAt,
        loading: false,
        // 已消失的选中项 / 勾选项清理
        selectedId: r.records.some((x) => x.id === get().selectedId) ? get().selectedId : null,
        checked: new Set([...get().checked].filter((id) => r.records.some((x) => x.id === id))),
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setView: (view) => set({ view, selectedId: null }),
  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setAgentFilter: (agentFilter) => set({ agentFilter, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  toggleBatch: () => set((s) => ({ batchMode: !s.batchMode, checked: new Set() })),
  toggleChecked: (id) =>
    set((s) => {
      const next = new Set(s.checked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { checked: next };
    }),
  checkAll: (ids) =>
    set((s) => ({
      checked: s.checked.size === ids.length ? new Set() : new Set(ids),
    })),

  setStatus: async (rec, to) => {
    const results = await executePlans([planSetStatus(rec, to, ctx(get().home))]);
    set({ lastResults: results });
    await get().refresh();
  },

  setAllowImplicit: async (rec, allow) => {
    const results = await executePlans([planSetAllowImplicit(rec, allow, ctx(get().home))]);
    set({ lastResults: results });
    await get().refresh();
  },

  requestArchive: (recs) => {
    const { plans, warnings } = withStoreImpact(get().records, recs, (r, links) =>
      planArchive(r, ctx(get().home), links),
    );
    set({
      confirm: {
        kind: 'archive',
        danger: warnings !== undefined,
        items: recs.map((r) => ({ name: r.name, sizeBytes: r.sizeBytes })),
        warnings,
        plans,
      },
    });
  },

  requestDelete: (recs) => {
    const { plans, warnings } = withStoreImpact(get().records, recs, (r, links) =>
      planDelete(r, ctx(get().home), links),
    );
    set({
      confirm: {
        kind: 'delete',
        danger: true,
        items: recs.map((r) => ({ name: r.name, sizeBytes: r.sizeBytes })),
        warnings,
        plans,
      },
    });
  },

  restore: async (item, mode) => {
    const [result] = await executePlans([planRestore(item.manifest, item.archiveDir, mode)]);
    if (result.ok) {
      await ipc.trashPath(item.manifestPath).catch(() => undefined);
    }
    set({ lastResults: [result] });
    await get().refresh();
    return result;
  },

  deleteArchived: async (item) => {
    await ipc.trashPath(item.archiveDir).catch(() => undefined);
    await ipc.trashPath(item.manifestPath).catch(() => undefined);
    await get().refresh();
  },

  batchSetStatus: async (recs, to) => {
    const targets = recs.filter((r) => !r.flags.strayFile && (to === 'on') !== (r.status !== 'off'));
    if (targets.length === 0) return;
    const plans = targets.map((r) => planSetStatus(r, to, ctx(get().home)));
    await runGuarded(set, get, 'status', plans);
  },

  confirmAccept: async () => {
    const c = get().confirm;
    if (!c) return;
    set({ confirm: null });
    await runGuarded(set, get, c.kind, c.plans);
  },

  confirmCancel: () => set({ confirm: null }),

  togglePlugin: async (agent, pluginKey, enabled) => {
    const plan = planTogglePlugin(agent, pluginKey, enabled, ctx(get().home));
    const results = await executePlans([plan]);
    set({ lastResults: results });
    await get().refresh();
  },

  addProject: async (path) => {
    const cfg = get().config;
    const p = path.replace(/\/+$/, '');
    if (cfg.manualProjects.includes(p)) return;
    await get().updateConfig({
      manualProjects: [...cfg.manualProjects, p],
      removedAutoProjects: cfg.removedAutoProjects.filter((x) => x !== p),
    });
  },

  removeProject: async (path) => {
    const cfg = get().config;
    await get().updateConfig({
      manualProjects: cfg.manualProjects.filter((x) => x !== path),
      removedAutoProjects: cfg.removedAutoProjects.includes(path)
        ? cfg.removedAutoProjects
        : [...cfg.removedAutoProjects, path],
    });
  },

  updateConfig: async (patch) => {
    const next = { ...get().config, ...patch };
    set({ config: next });
    await ipc.writeSkimConfig(JSON.stringify(next, null, 2));
    await get().refresh();
  },

  checkUpdate: async () => {
    const info = await checkForUpdate();
    if (info) set({ update: info, updateDismissed: false });
  },

  dismissUpdate: () => set({ updateDismissed: true }),

  installUpdate: async () => {
    set({ updateInstalling: true });
    try {
      await downloadAndInstall(() => {});
    } finally {
      set({ updateInstalling: false });
    }
  },
}));

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 当前视图可见记录（搜索 + 筛选） */
export function visibleRecords(s: Pick<SkimState, 'records' | 'search' | 'statusFilter' | 'agentFilter'>): SkillRecord[] {
  const q = s.search.trim().toLowerCase();
  return s.records.filter((r) => {
    // Plugin scope 由 SkillsView 的 pluginGroups 单独渲染，不进常规列表
    if (r.scope.kind === 'plugin') return false;
    if (s.agentFilter === 'claude' || s.agentFilter === 'codex') {
      // Agents 视图 = 该 agent 的用户级（含 bundled 与 Store，Codex 确实加载两者）；项目级归 Projects
      if (r.agent !== s.agentFilter || r.scope.kind === 'project') return false;
    } else if (s.agentFilter === 'store') {
      if (!isStoreRecord(r)) return false;
    } else if (s.agentFilter.startsWith('project:')) {
      const proj = s.agentFilter.slice('project:'.length);
      if (r.scope.kind !== 'project' || r.scope.project !== proj) return false;
    }
    if (s.statusFilter === 'on' && r.status !== 'on') return false;
    if (s.statusFilter === 'off' && r.status === 'on') return false;
    if (
      s.statusFilter === 'issues' &&
      !(r.flags.duplicate || r.flags.conflict || r.flags.strayFile || r.flags.parseError)
    )
      return false;
    if (q && !r.name.toLowerCase().includes(q) && !(r.description ?? '').toLowerCase().includes(q))
      return false;
    return true;
  });
}
