// 领域层类型 — tech-design.md「运行时模型」。本目录纯函数零 IO（eslint 强制）。

export type AgentKind = 'claude' | 'codex';

export type Scope =
  | { kind: 'user'; root: string }
  | { kind: 'project'; root: string; project: string }
  | { kind: 'bundled'; root: string }
  | { kind: 'plugin'; root: string; pluginKey: string; version: string; pluginEnabled: boolean; installScope: 'user' | 'project'; projectPath?: string };

/** Claude 四档；Codex 仅 on/off（enabled），allowImplicitInvocation 正交 */
export type SkillStatus = 'on' | 'name-only' | 'user-invocable-only' | 'off';

export interface SkillFlags {
  /** 与对应用户级同名且 SKILL.md 内容一致 —— 这份是冗余拷贝（仅项目级会被标记） */
  duplicate: boolean;
  /** 同一运行时可见范围内同名但内容分叉：项目级 vs 用户级；~/.codex/skills vs Store */
  conflict: boolean;
  strayFile: boolean;
  parseError: boolean;
  /** 禁止 archive / delete（bundled + plugin 技能） */
  locked: boolean;
  /** 禁止行级 enable/disable（plugin 技能专用；bundled 技能可改状态） */
  statusLocked: boolean;
}

export interface SkillRecord {
  id: string;
  agent: AgentKind;
  scope: Scope;
  dirPath: string;
  /** canonicalize 后的真实路径 */
  realPath: string;
  /** 该安装本身是软链（指向 realPath） */
  isSymlink: boolean;
  /** SKILL.md 头部内容指纹（副本/冲突判定用） */
  contentKey: string;
  name: string;
  description: string | null;
  status: SkillStatus;
  /** 状态来自哪个配置文件；null = 无任何 override（默认 on） */
  statusSource: string | null;
  /** Codex only：false = 不自动触发 */
  allowImplicitInvocation: boolean;
  sizeBytes: number;
  fileCount: number;
  flags: SkillFlags;
}

// ---- 扫描输入（与 Rust read.rs 的 Serialize 输出一一对应） ----

export interface DirEntrySnapshot {
  dir_path: string;
  real_path: string;
  is_symlink: boolean;
  dir_name: string;
  skill_md_head: string | null;
  size_bytes: number;
  file_count: number;
}

export interface StrayFileSnapshot {
  path: string;
  name: string;
  size_bytes: number;
}

export interface RootSnapshot {
  root: string;
  exists: boolean;
  skills: DirEntrySnapshot[];
  stray_files: StrayFileSnapshot[];
}

/** 一个被扫描根的语义标注：它属于哪个 agent、哪个作用域 */
export interface ScanRoot {
  agent: AgentKind;
  scope: Scope;
}

// ---- 配置输入 ----

export interface ClaudeSettingsLayer {
  /** settings 文件路径（回写与展示用） */
  path: string;
  /** 解析后的 skillOverrides；文件不存在 = {}；解析失败 = null（降级只读） */
  overrides: Record<string, string> | null;
}

export interface CodexConfigEntry {
  /** config.toml 原文中的 path 值 */
  rawPath: string;
  enabled: boolean | null;
  allowImplicitInvocation: boolean | null;
}

export interface CodexConfig {
  path: string;
  /** null = 解析失败（降级只读） */
  entries: CodexConfigEntry[] | null;
}

// ---- 操作计划（计划/执行分离，tech-design.md ADR-2） ----

export interface ClaudePatchOp {
  kind: 'claude-settings';
  settingsPath: string;
  /** skillName -> 档位；null 表示删除该键 */
  set: Record<string, SkillStatus | null>;
}

export interface CodexPatchOp {
  kind: 'codex-toml';
  configPath: string;
  skillDir: string;
  setEnabled?: boolean;
  remove?: boolean;
  setAllowImplicit?: boolean;
}

export interface MoveDirOp {
  kind: 'archive-move';
  src: string;
  dst: string;
  manifestPath: string;
  manifest: ArchiveManifest;
}

export interface TrashOp {
  kind: 'trash';
  path: string;
}

export interface RestoreOp {
  kind: 'restore-move';
  src: string;
  dst: string;
  mode: 'fail' | 'overwrite' | 'rename';
}

export interface ClaudePluginToggleOp {
  kind: 'claude-plugin-toggle';
  settingsPath: string;
  pluginKey: string;
  enabled: boolean;
}

export interface CodexPluginToggleOp {
  kind: 'codex-plugin-toggle';
  configPath: string;
  pluginKey: string;
  enabled: boolean;
}

export type OpStep = ClaudePatchOp | CodexPatchOp | MoveDirOp | TrashOp | RestoreOp | ClaudePluginToggleOp | CodexPluginToggleOp;

export interface OpPlan {
  /** 给确认弹层的摘要行 */
  summary: { action: string; skillName: string; detail: string };
  steps: OpStep[];
}

// ---- 归档 ----

export interface ArchiveManifest {
  version: 1;
  skillName: string;
  agent: AgentKind;
  scope: 'user' | 'project' | 'bundled';
  sourcePath: string;
  archivedAt: string;
  statusBeforeArchive: SkillStatus;
  sizeBytes: number;
}

// ---- 项目发现 ----

export interface ProjectCandidate {
  path: string;
  origin: 'auto-claude' | 'auto-codex' | 'manual';
}

export interface SkimConfig {
  version: 1;
  manualProjects: string[];
  removedAutoProjects: string[];
  refresh: { auto: boolean; intervalSec: number };
  advancedMode: boolean;
  locale: 'auto' | 'en' | 'zh-CN';
}

export const DEFAULT_SKIM_CONFIG: SkimConfig = {
  version: 1,
  manualProjects: [],
  removedAutoProjects: [],
  refresh: { auto: true, intervalSec: 30 },
  advancedMode: false,
  locale: 'auto',
};
