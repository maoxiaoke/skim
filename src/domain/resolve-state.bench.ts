import { bench, describe } from 'vitest';
import { resolveStates } from './resolve-state';
import type { ResolveInput } from './resolve-state';
import type { RootSnapshot } from './types';

// tech-design.md 基准：200 技能 resolveStates < 50ms（扫描 <1s 在 Rust 侧另测）
function makeInput(n: number): ResolveInput {
  const root = '/Users/x/.claude/skills';
  const snap: RootSnapshot = {
    root,
    exists: true,
    skills: Array.from({ length: n }, (_, i) => ({
      dir_path: `${root}/skill-${i}`,
      real_path: `${root}/skill-${i}`,
      is_symlink: false,
      dir_name: `skill-${i}`,
      skill_md_head: `---\nname: skill-${i}\ndescription: Description for skill number ${i % 50}\n---\n# Body`,
      size_bytes: 1024 * i,
      file_count: 5,
    })),
    stray_files: [],
  };
  const overrides = Object.fromEntries(
    Array.from({ length: n / 4 }, (_, i) => [`skill-${i * 4}`, 'off']),
  );
  return {
    snapshots: [{ root: { agent: 'claude', scope: { kind: 'user', root } }, snap }],
    claudeLayersFor: () => [{ path: '/Users/x/.claude/settings.json', overrides }],
    codexConfig: { path: '/Users/x/.codex/config.toml', entries: [] },
  };
}

describe('resolveStates @ 200 skills', () => {
  const input = makeInput(200);
  bench('resolve', () => {
    resolveStates(input);
  });
});
