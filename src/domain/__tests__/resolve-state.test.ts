import { describe, expect, it } from 'vitest';
import {
  isEffectiveCodexEntry,
  normalizeCodexEntryPath,
  resolveStates,
} from '../resolve-state';
import type { ClaudeSettingsLayer, ResolveInput } from '../resolve-state';
import type { RootSnapshot, ScanRoot } from '../types';

const HOME = '/Users/x';

function snap(
  root: string,
  dirs: [string, string | null][],
  strays: string[] = [],
  realPathFor?: (name: string) => string,
): RootSnapshot {
  return {
    root,
    exists: true,
    skills: dirs.map(([name, head]) => ({
      dir_path: `${root}/${name}`,
      real_path: realPathFor ? realPathFor(name) : `${root}/${name}`,
      is_symlink: realPathFor ? realPathFor(name) !== `${root}/${name}` : false,
      dir_name: name,
      skill_md_head: head,
      size_bytes: 1000,
      file_count: 3,
    })),
    stray_files: strays.map((name) => ({ path: `${root}/${name}`, name, size_bytes: 10 })),
  };
}

const head = (name: string, desc: string) => `---\nname: ${name}\ndescription: ${desc}\n---\n`;

function baseInput(overrides?: Partial<ResolveInput>): ResolveInput {
  const claudeUserRoot: ScanRoot = {
    agent: 'claude',
    scope: { kind: 'user', root: `${HOME}/.claude/skills` },
  };
  return {
    snapshots: [
      {
        root: claudeUserRoot,
        snap: snap(`${HOME}/.claude/skills`, [
          ['brainstorming', head('brainstorming', 'Explores intent')],
          ['alpha', head('alpha', 'A test skill')],
          ['beta', head('beta', 'A test skill')],
        ]),
      },
    ],
    claudeLayersFor: () => [
      { path: `${HOME}/.claude/settings.json`, overrides: { brainstorming: 'off' } },
    ],
    codexConfig: { path: `${HOME}/.codex/config.toml`, entries: [] },
    ...overrides,
  };
}

describe('resolveStates — claude', () => {
  it('applies overrides and defaults to on', () => {
    const { records } = resolveStates(baseInput());
    const b = records.find((r) => r.name === 'brainstorming')!;
    expect(b.status).toBe('off');
    expect(b.statusSource).toBe(`${HOME}/.claude/settings.json`);
    expect(records.find((r) => r.name === 'alpha')!.status).toBe('on');
  });

  it('later layers win (user < project < local)', () => {
    const layers: ClaudeSettingsLayer[] = [
      { path: 'u/settings.json', overrides: { brainstorming: 'off' } },
      { path: 'p/.claude/settings.json', overrides: { brainstorming: 'name-only' } },
      { path: 'p/.claude/settings.local.json', overrides: { brainstorming: 'on' } },
    ];
    const { records } = resolveStates(baseInput({ claudeLayersFor: () => layers }));
    const b = records.find((r) => r.name === 'brainstorming')!;
    expect(b.status).toBe('on');
    expect(b.statusSource).toBe('p/.claude/settings.local.json');
  });

  it('corrupt layer is reported and skipped', () => {
    const layers: ClaudeSettingsLayer[] = [
      { path: 'u/settings.json', overrides: { brainstorming: 'off' } },
      { path: 'p/.claude/settings.json', overrides: null },
    ];
    const out = resolveStates(baseInput({ claudeLayersFor: () => layers }));
    expect(out.corruptConfigs).toContain('p/.claude/settings.json');
    expect(out.records.find((r) => r.name === 'brainstorming')!.status).toBe('off');
  });

  it('unknown override values are ignored', () => {
    const layers: ClaudeSettingsLayer[] = [
      { path: 'u/settings.json', overrides: { brainstorming: 'banana' } },
    ];
    const { records } = resolveStates(baseInput({ claudeLayersFor: () => layers }));
    expect(records.find((r) => r.name === 'brainstorming')!.status).toBe('on');
  });

  it('same description with different names is NOT a duplicate (名字不同即不同技能)', () => {
    const { records } = resolveStates(baseInput());
    expect(records.find((r) => r.name === 'alpha')!.flags.duplicate).toBe(false);
    expect(records.find((r) => r.name === 'beta')!.flags.duplicate).toBe(false);
  });
});

describe('detectDuplicates — 运行时可见性语义', () => {
  const claudeUser: ScanRoot = { agent: 'claude', scope: { kind: 'user', root: `${HOME}/.claude/skills` } };
  const codexUser: ScanRoot = { agent: 'codex', scope: { kind: 'user', root: `${HOME}/.codex/skills` } };
  const storeRoot: ScanRoot = { agent: 'codex', scope: { kind: 'user', root: `${HOME}/.agents/skills` } };
  const claudeProj: ScanRoot = {
    agent: 'claude',
    scope: { kind: 'project', root: '/p/.claude/skills', project: '/p' },
  };

  const HEAD = head('adapt', 'Adapt designs');
  const HEAD_V2 = head('adapt', 'Adapt designs v2 — diverged');

  function input(snapshots: ResolveInput['snapshots']): ResolveInput {
    return {
      snapshots,
      claudeLayersFor: () => [],
      codexConfig: { path: `${HOME}/.codex/config.toml`, entries: [] },
    };
  }

  const byPath = (records: { dirPath: string }[], frag: string) =>
    records.find((r) => r.dirPath.includes(frag))! as import('../types').SkillRecord;

  it('项目级与用户级同名、SKILL.md 一致 → 项目级标 duplicate，用户级干净', () => {
    const { records } = resolveStates(
      input([
        { root: claudeUser, snap: snap(`${HOME}/.claude/skills`, [['adapt', HEAD]]) },
        { root: claudeProj, snap: snap('/p/.claude/skills', [['adapt', HEAD]]) },
      ]),
    );
    expect(byPath(records, '/p/').flags.duplicate).toBe(true);
    expect(byPath(records, '/p/').flags.conflict).toBe(false);
    expect(byPath(records, '.claude/skills/adapt').flags.duplicate).toBe(false);
  });

  it('项目级与用户级同名、内容分叉 → 项目级标 conflict', () => {
    const { records } = resolveStates(
      input([
        { root: claudeUser, snap: snap(`${HOME}/.claude/skills`, [['adapt', HEAD]]) },
        { root: claudeProj, snap: snap('/p/.claude/skills', [['adapt', HEAD_V2]]) },
      ]),
    );
    expect(byPath(records, '/p/').flags.conflict).toBe(true);
    expect(byPath(records, '/p/').flags.duplicate).toBe(false);
  });

  it('项目级软链指向用户级实体（realPath 相同）→ 不标记', () => {
    const { records } = resolveStates(
      input([
        { root: claudeUser, snap: snap(`${HOME}/.claude/skills`, [['adapt', HEAD]]) },
        {
          root: claudeProj,
          snap: snap('/p/.claude/skills', [['adapt', HEAD]], [], () => `${HOME}/.claude/skills/adapt`),
        },
      ]),
    );
    for (const r of records) {
      expect(r.flags.duplicate).toBe(false);
      expect(r.flags.conflict).toBe(false);
    }
  });

  it('~/.codex/skills 与 Store 同名内容分叉 → 仅 codex 侧标 conflict；内容一致不标', () => {
    const diverged = resolveStates(
      input([
        { root: codexUser, snap: snap(`${HOME}/.codex/skills`, [['adapt', HEAD]]) },
        { root: storeRoot, snap: snap(`${HOME}/.agents/skills`, [['adapt', HEAD_V2]]) },
      ]),
    );
    expect(byPath(diverged.records, '.codex/skills/adapt').flags.conflict).toBe(true);
    expect(byPath(diverged.records, '.agents/skills/adapt').flags.conflict).toBe(false);

    const identical = resolveStates(
      input([
        { root: codexUser, snap: snap(`${HOME}/.codex/skills`, [['adapt', HEAD]]) },
        { root: storeRoot, snap: snap(`${HOME}/.agents/skills`, [['adapt', HEAD]]) },
      ]),
    );
    for (const r of identical.records) {
      expect(r.flags.conflict).toBe(false);
      expect(r.flags.duplicate).toBe(false);
    }
  });

  it('Claude 用户级与 Store 同名（跨运行时）→ 互不相干，不标记', () => {
    const { records } = resolveStates(
      input([
        { root: claudeUser, snap: snap(`${HOME}/.claude/skills`, [['adapt', HEAD]]) },
        { root: storeRoot, snap: snap(`${HOME}/.agents/skills`, [['adapt', HEAD_V2]]) },
      ]),
    );
    for (const r of records) {
      expect(r.flags.conflict).toBe(false);
      expect(r.flags.duplicate).toBe(false);
    }
  });
});

describe('resolveStates — codex', () => {
  const codexRoot: ScanRoot = { agent: 'codex', scope: { kind: 'user', root: `${HOME}/.codex/skills` } };
  const bundledRoot: ScanRoot = {
    agent: 'codex',
    scope: { kind: 'bundled', root: `${HOME}/.codex/skills/.system` },
  };

  function codexInput(entries: ResolveInput['codexConfig']['entries']): ResolveInput {
    return {
      snapshots: [
        {
          root: codexRoot,
          snap: snap(`${HOME}/.codex/skills`, [['pdf', head('pdf', 'PDF skill')]], ['rams.md']),
        },
        {
          root: bundledRoot,
          snap: snap(`${HOME}/.codex/skills/.system`, [['skill-creator', head('skill-creator', 'Create skills')]]),
        },
      ],
      claudeLayersFor: () => [],
      codexConfig: { path: `${HOME}/.codex/config.toml`, entries },
    };
  }

  it('SKILL.md-form entry disables; dir-form entry is a dead entry (R2)', () => {
    const offViaSkillMd = resolveStates(
      codexInput([
        { rawPath: `${HOME}/.codex/skills/pdf/SKILL.md`, enabled: false, allowImplicitInvocation: null },
      ]),
    );
    expect(offViaSkillMd.records.find((r) => r.name === 'pdf')!.status).toBe('off');

    const offViaDir = resolveStates(
      codexInput([
        { rawPath: `${HOME}/.codex/skills/pdf`, enabled: false, allowImplicitInvocation: null },
      ]),
    );
    expect(offViaDir.records.find((r) => r.name === 'pdf')!.status).toBe('on');
  });

  it('allow_implicit_invocation=false surfaces on record', () => {
    const { records } = resolveStates(
      codexInput([
        { rawPath: `${HOME}/.codex/skills/pdf/SKILL.md`, enabled: true, allowImplicitInvocation: false },
      ]),
    );
    const pdf = records.find((r) => r.name === 'pdf')!;
    expect(pdf.status).toBe('on');
    expect(pdf.allowImplicitInvocation).toBe(false);
  });

  it('bundled skills are locked; stray files flagged', () => {
    const { records } = resolveStates(codexInput([]));
    expect(records.find((r) => r.name === 'skill-creator')!.flags.locked).toBe(true);
    const stray = records.find((r) => r.name === 'rams.md')!;
    expect(stray.flags.strayFile).toBe(true);
  });

  it('corrupt codex config reported, skills default on', () => {
    const out = resolveStates(codexInput(null));
    expect(out.corruptConfigs).toContain(`${HOME}/.codex/config.toml`);
    expect(out.records.find((r) => r.name === 'pdf')!.status).toBe('on');
  });

  it('non-existent roots are skipped silently', () => {
    const input = codexInput([]);
    input.snapshots.push({
      root: codexRoot,
      snap: { root: '/nope/.codex/skills', exists: false, skills: [], stray_files: [] },
    });
    expect(() => resolveStates(input)).not.toThrow();
  });
});

describe('path helpers', () => {
  it('normalizes both entry forms', () => {
    expect(normalizeCodexEntryPath('/a/b/SKILL.md')).toBe('/a/b');
    expect(normalizeCodexEntryPath('/a/b/')).toBe('/a/b');
    expect(normalizeCodexEntryPath('/a/b')).toBe('/a/b');
  });

  it('only SKILL.md form is effective', () => {
    expect(isEffectiveCodexEntry('/a/b/SKILL.md')).toBe(true);
    expect(isEffectiveCodexEntry('/a/b')).toBe(false);
    expect(isEffectiveCodexEntry('/a/b/')).toBe(false);
  });
});
