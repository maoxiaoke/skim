import { describe, expect, it } from 'vitest';
import {
  archiveDirFor,
  pathHash,
  planArchive,
  planDelete,
  planRestore,
  planSetAllowImplicit,
  planSetStatus,
} from '../plan-ops';
import type { PlanCtx } from '../plan-ops';
import type { SkillRecord } from '../types';

const ctx: PlanCtx = { home: '/Users/x', nowIso: '2026-06-12T08:00:00Z' };

function rec(over: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'claude:/Users/x/.claude/skills/draw',
    agent: 'claude',
    scope: { kind: 'user', root: '/Users/x/.claude/skills' },
    dirPath: '/Users/x/.claude/skills/draw',
    name: 'draw',
    description: 'Draw things',
    status: 'on',
    statusSource: null,
    allowImplicitInvocation: true,
    sizeBytes: 1234,
    fileCount: 8,
    flags: { duplicate: false, conflict: false, strayFile: false, parseError: false, locked: false, statusLocked: false },
    ...over,
  };
}

const codexRec = (over: Partial<SkillRecord> = {}) =>
  rec({
    id: 'codex:/Users/x/.codex/skills/pdf',
    agent: 'codex',
    scope: { kind: 'user', root: '/Users/x/.codex/skills' },
    dirPath: '/Users/x/.codex/skills/pdf',
    name: 'pdf',
    ...over,
  });

describe('planSetStatus — claude', () => {
  it('user-scope writes user settings; off sets override', () => {
    const plan = planSetStatus(rec(), 'off', ctx);
    expect(plan.steps).toEqual([
      {
        kind: 'claude-settings',
        settingsPath: '/Users/x/.claude/settings.json',
        set: { draw: 'off' },
      },
    ]);
  });

  it('back to on removes the override key', () => {
    const plan = planSetStatus(rec({ status: 'off' }), 'on', ctx);
    expect(plan.steps[0]).toMatchObject({ set: { draw: null } });
  });

  it('project-scope writes settings.local.json (git-untracked)', () => {
    const r = rec({
      scope: { kind: 'project', root: '/p/.claude/skills', project: '/p' },
      dirPath: '/p/.claude/skills/draw',
    });
    const plan = planSetStatus(r, 'name-only', ctx);
    expect(plan.steps[0]).toMatchObject({ settingsPath: '/p/.claude/settings.local.json' });
  });

  it('rejects stray files', () => {
    expect(() =>
      planSetStatus(rec({ flags: { duplicate: false, conflict: false, strayFile: true, parseError: false, locked: false, statusLocked: false } }), 'off', ctx),
    ).toThrow();
  });
});

describe('planSetStatus — codex', () => {
  it('off sets enabled=false on global config', () => {
    const plan = planSetStatus(codexRec(), 'off', ctx);
    expect(plan.steps).toEqual([
      {
        kind: 'codex-toml',
        configPath: '/Users/x/.codex/config.toml',
        skillDir: '/Users/x/.codex/skills/pdf',
        setEnabled: false,
      },
    ]);
  });

  it('clean re-enable removes the entry entirely', () => {
    const plan = planSetStatus(codexRec({ status: 'off' }), 'on', ctx);
    expect(plan.steps[0]).toMatchObject({ remove: true });
  });

  it('re-enable keeps entry when allow-implicit customized', () => {
    const plan = planSetStatus(codexRec({ status: 'off', allowImplicitInvocation: false }), 'on', ctx);
    expect(plan.steps[0]).toMatchObject({ setEnabled: true });
  });

  it('rejects claude-only statuses', () => {
    expect(() => planSetStatus(codexRec(), 'name-only', ctx)).toThrow(/on\/off/);
  });

  it('planSetAllowImplicit is codex-only and preserves enabled', () => {
    const plan = planSetAllowImplicit(codexRec({ status: 'off' }), false, ctx);
    expect(plan.steps[0]).toMatchObject({ setEnabled: false, setAllowImplicit: false });
    expect(() => planSetAllowImplicit(rec(), false, ctx)).toThrow();
  });
});

describe('planArchive / planDelete', () => {
  it('archive moves to hashed namespace with manifest + config cleanup', () => {
    const r = rec({ status: 'off', statusSource: '/Users/x/.claude/settings.json' });
    const plan = planArchive(r, ctx);
    const dst = archiveDirFor(r, ctx);
    expect(dst).toBe(`/Users/x/.skim/archive/claude/${pathHash(r.dirPath)}/draw`);
    expect(plan.steps[0]).toMatchObject({
      kind: 'archive-move',
      src: r.dirPath,
      dst,
      manifestPath: `${dst}.manifest.json`,
      manifest: {
        version: 1,
        skillName: 'draw',
        sourcePath: r.dirPath,
        statusBeforeArchive: 'off',
        archivedAt: ctx.nowIso,
      },
    });
    expect(plan.steps[1]).toMatchObject({ kind: 'claude-settings', set: { draw: null } });
  });

  it('archive skips config cleanup when nothing was configured', () => {
    expect(planArchive(rec(), ctx).steps).toHaveLength(1);
  });

  it('delete trashes and cleans codex entry', () => {
    const r = codexRec({ status: 'off', statusSource: '/Users/x/.codex/config.toml' });
    const plan = planDelete(r, ctx);
    expect(plan.steps[0]).toEqual({ kind: 'trash', path: r.dirPath });
    expect(plan.steps[1]).toMatchObject({ kind: 'codex-toml', remove: true });
  });

  it('bundled skills cannot be archived or deleted', () => {
    const locked = rec({ flags: { duplicate: false, conflict: false, strayFile: false, parseError: false, locked: true, statusLocked: false } });
    expect(() => planArchive(locked, ctx)).toThrow();
    expect(() => planDelete(locked, ctx)).toThrow();
  });

  it('deleting a store entity cleans up linked installs and their configs', () => {
    const store = codexRec({
      id: 'codex:/Users/x/.agents/skills/draw',
      scope: { kind: 'user', root: '/Users/x/.agents/skills' },
      dirPath: '/Users/x/.agents/skills/draw',
      name: 'draw',
    });
    const link = rec({
      id: 'claude:/Users/x/.claude/skills/draw',
      dirPath: '/Users/x/.claude/skills/draw',
      status: 'off',
      statusSource: '/Users/x/.claude/settings.json',
    });
    const plan = planDelete(store, ctx, [link]);
    expect(plan.steps[0]).toEqual({ kind: 'trash', path: store.dirPath });
    // 废链清理 + 该链在 Claude 配置里的残留 override 清理
    expect(plan.steps).toContainEqual({ kind: 'trash', path: link.dirPath });
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: 'claude-settings', set: { draw: null } }),
    );
  });

  it('stray files cannot be archived but can be deleted', () => {
    const stray = rec({ flags: { duplicate: false, conflict: false, strayFile: true, parseError: false, locked: false, statusLocked: false } });
    expect(() => planArchive(stray, ctx)).toThrow();
    expect(planDelete(stray, ctx).steps).toEqual([{ kind: 'trash', path: stray.dirPath }]);
  });
});

describe('planRestore / pathHash', () => {
  it('restore moves archive back to source', () => {
    const plan = planRestore(
      {
        version: 1,
        skillName: 'draw',
        agent: 'claude',
        scope: 'user',
        sourcePath: '/Users/x/.claude/skills/draw',
        archivedAt: ctx.nowIso,
        statusBeforeArchive: 'on',
        sizeBytes: 1,
      },
      '/Users/x/.skim/archive/claude/abc/draw',
      'rename',
    );
    expect(plan.steps[0]).toEqual({
      kind: 'restore-move',
      src: '/Users/x/.skim/archive/claude/abc/draw',
      dst: '/Users/x/.claude/skills/draw',
      mode: 'rename',
    });
  });

  it('pathHash is stable and distinguishes paths', () => {
    expect(pathHash('/a/b')).toBe(pathHash('/a/b'));
    expect(pathHash('/a/b')).not.toBe(pathHash('/a/c'));
    expect(pathHash('/a/b')).toMatch(/^[0-9a-f]{8}$/);
  });
});
