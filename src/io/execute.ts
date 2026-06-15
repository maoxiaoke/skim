// OpPlan 执行器：领域层产出的计划 → IPC 调用。每步执行前现读现校验（乐观锁）。
import type { OpPlan, OpStep } from '../domain/types';
import { applyClaudeOverrides, applyClaudePluginEnabled } from '../domain/diff-config';
import { ipc, ipcErrorMessage, sha256Hex } from './tauri';

export interface StepResult {
  step: OpStep;
  ok: boolean;
  error?: string;
}

export interface PlanResult {
  plan: OpPlan;
  ok: boolean;
  steps: StepResult[];
}

async function executeStep(step: OpStep): Promise<void> {
  switch (step.kind) {
    case 'claude-settings': {
      const [file] = await ipc.readTextFiles([step.settingsPath]);
      const raw = file.content ?? '';
      const next = applyClaudeOverrides(raw, step.set);
      const expected = file.content === null ? null : await sha256Hex(raw);
      await ipc.writeClaudeSettings(step.settingsPath, next, expected);
      return;
    }
    case 'codex-toml': {
      const cfg = await ipc.readCodexConfig(step.configPath);
      await ipc.applyCodexTomlPatch(
        step.configPath,
        [
          {
            skill_dir: step.skillDir,
            ...(step.setEnabled !== undefined ? { set_enabled: step.setEnabled } : {}),
            ...(step.remove ? { remove: true } : {}),
            ...(step.setAllowImplicit !== undefined
              ? { set_allow_implicit: step.setAllowImplicit }
              : {}),
          },
        ],
        cfg.hash,
      );
      return;
    }
    case 'claude-plugin-toggle': {
      const [file] = await ipc.readTextFiles([step.settingsPath]);
      const raw = file.content ?? '';
      const next = applyClaudePluginEnabled(raw, step.pluginKey, step.enabled);
      const expected = file.content === null ? null : await sha256Hex(raw);
      await ipc.writeClaudeSettings(step.settingsPath, next, expected);
      return;
    }
    case 'codex-plugin-toggle': {
      const cfg = await ipc.readCodexConfig(step.configPath);
      await ipc.applyCodexPluginPatch(step.configPath, step.pluginKey, step.enabled, cfg.hash);
      return;
    }
    case 'archive-move':
      await ipc.archiveMove(step.src, step.dst, step.manifestPath, JSON.stringify(step.manifest, null, 2));
      return;
    case 'trash':
      await ipc.trashPath(step.path);
      return;
    case 'restore-move':
      await ipc.restoreMove(step.src, step.dst, step.mode);
      return;
  }
}

/** 单计划：步骤串行，失败即停（已成功步骤不回滚——例如目录已归档但配置清理失败，刷新后状态如实呈现） */
export async function executePlan(plan: OpPlan): Promise<PlanResult> {
  const steps: StepResult[] = [];
  for (const step of plan.steps) {
    try {
      await executeStep(step);
      steps.push({ step, ok: true });
    } catch (e) {
      steps.push({ step, ok: false, error: ipcErrorMessage(e) });
      return { plan, ok: false, steps };
    }
  }
  return { plan, ok: true, steps };
}

/** 批量：计划间互不影响，逐个执行（PRD F6:部分失败不回滚成功项）；onProgress 驱动进度遮罩 */
export async function executePlans(
  plans: OpPlan[],
  onProgress?: (done: number) => void,
): Promise<PlanResult[]> {
  const out: PlanResult[] = [];
  for (const p of plans) {
    out.push(await executePlan(p));
    onProgress?.(out.length);
  }
  return out;
}
