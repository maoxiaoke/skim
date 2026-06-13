import type {
  ArchiveManifest,
  OpPlan,
  SkillRecord,
  SkillStatus,
} from './types';

/** 领域层不允许碰环境：home 与时间由调用方注入 */
export interface PlanCtx {
  home: string;
  nowIso: string;
}

/** 稳定短哈希（djb2 hex），用于归档命名空间隔离同名技能 */
export function pathHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function claudeSettingsPathFor(rec: SkillRecord, ctx: PlanCtx): string {
  // 项目级写 settings.local.json（git 不跟踪，PRD F3）；用户级写用户 settings.json
  return rec.scope.kind === 'project'
    ? `${rec.scope.project}/.claude/settings.local.json`
    : `${ctx.home}/.claude/settings.json`;
}

const codexConfigPath = (ctx: PlanCtx) => `${ctx.home}/.codex/config.toml`;

export function planSetStatus(rec: SkillRecord, to: SkillStatus, ctx: PlanCtx): OpPlan {
  if (rec.flags.strayFile) throw new Error('stray files have no status');
  const summary = { action: 'set-status', skillName: rec.name, detail: to };

  if (rec.agent === 'claude') {
    return {
      summary,
      steps: [
        {
          kind: 'claude-settings',
          settingsPath: claudeSettingsPathFor(rec, ctx),
          // 'on' = 移除 override 回到默认，避免残留死配置
          set: { [rec.name]: to === 'on' ? null : to },
        },
      ],
    };
  }

  // Codex 只支持 on/off
  if (to !== 'on' && to !== 'off') {
    throw new Error(`codex skills only support on/off, got ${to}`);
  }
  const cleanEnable = to === 'on' && rec.allowImplicitInvocation;
  return {
    summary,
    steps: [
      {
        kind: 'codex-toml',
        configPath: codexConfigPath(ctx),
        skillDir: rec.dirPath,
        // 回到完全默认态时直接移除条目；否则更新 enabled
        ...(cleanEnable ? { remove: true } : { setEnabled: to === 'on' }),
      },
    ],
  };
}

export function planSetAllowImplicit(rec: SkillRecord, allow: boolean, ctx: PlanCtx): OpPlan {
  if (rec.agent !== 'codex') throw new Error('allow-implicit is codex-only');
  return {
    summary: { action: 'set-allow-implicit', skillName: rec.name, detail: String(allow) },
    steps: [
      {
        kind: 'codex-toml',
        configPath: codexConfigPath(ctx),
        skillDir: rec.dirPath,
        setEnabled: rec.status !== 'off',
        setAllowImplicit: allow,
      },
    ],
  };
}

/** 归档/删除都要连带清掉该技能的禁用配置，避免死条目（PRD F4/F5） */
function configCleanupStep(rec: SkillRecord, ctx: PlanCtx): OpPlan['steps'] {
  if (rec.flags.strayFile) return [];
  if (rec.agent === 'claude') {
    if (rec.status === 'on' && rec.statusSource === null) return [];
    return [
      {
        kind: 'claude-settings',
        settingsPath: rec.statusSource ?? claudeSettingsPathFor(rec, ctx),
        set: { [rec.name]: null },
      },
    ];
  }
  if (rec.statusSource === null && rec.allowImplicitInvocation) return [];
  return [
    {
      kind: 'codex-toml',
      configPath: codexConfigPath(ctx),
      skillDir: rec.dirPath,
      remove: true,
    },
  ];
}

export function archiveDirFor(rec: SkillRecord, ctx: PlanCtx): string {
  return `${ctx.home}/.skim/archive/${rec.agent}/${pathHash(rec.dirPath)}/${rec.name}`;
}

/** 实体被移走后，指向它的软链安装变成废链：连链带各自的配置项一并清理 */
function linkedCleanupSteps(linkedInstalls: SkillRecord[], ctx: PlanCtx): OpPlan['steps'] {
  return linkedInstalls.flatMap((link) => [
    { kind: 'trash' as const, path: link.dirPath },
    ...configCleanupStep(link, ctx),
  ]);
}

export function planArchive(rec: SkillRecord, ctx: PlanCtx, linkedInstalls: SkillRecord[] = []): OpPlan {
  if (rec.flags.locked) throw new Error('bundled skills cannot be archived');
  if (rec.flags.strayFile) throw new Error('stray files cannot be archived; delete instead');
  const dst = archiveDirFor(rec, ctx);
  const manifest: ArchiveManifest = {
    version: 1,
    skillName: rec.name,
    agent: rec.agent,
    scope: rec.scope.kind,
    sourcePath: rec.dirPath,
    archivedAt: ctx.nowIso,
    statusBeforeArchive: rec.status,
    sizeBytes: rec.sizeBytes,
  };
  return {
    summary: { action: 'archive', skillName: rec.name, detail: dst },
    steps: [
      { kind: 'archive-move', src: rec.dirPath, dst, manifestPath: `${dst}.manifest.json`, manifest },
      ...configCleanupStep(rec, ctx),
      ...linkedCleanupSteps(linkedInstalls, ctx),
    ],
  };
}

export function planDelete(rec: SkillRecord, ctx: PlanCtx, linkedInstalls: SkillRecord[] = []): OpPlan {
  if (rec.flags.locked) throw new Error('bundled skills cannot be deleted');
  return {
    summary: { action: 'delete', skillName: rec.name, detail: rec.dirPath },
    steps: [
      { kind: 'trash', path: rec.dirPath },
      ...configCleanupStep(rec, ctx),
      ...linkedCleanupSteps(linkedInstalls, ctx),
    ],
  };
}

export function planRestore(
  manifest: ArchiveManifest,
  archiveDir: string,
  mode: 'fail' | 'overwrite' | 'rename',
): OpPlan {
  return {
    summary: { action: 'restore', skillName: manifest.skillName, detail: manifest.sourcePath },
    steps: [{ kind: 'restore-move', src: archiveDir, dst: manifest.sourcePath, mode }],
  };
}
