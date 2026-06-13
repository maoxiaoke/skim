import { describe, expect, it } from 'vitest';
import {
  decodeClaudeProjectPath,
  discoverProjects,
  parseCodexSessionIndex,
} from '../discover-projects';
import { DEFAULT_SKIM_CONFIG } from '../types';

describe('decodeClaudeProjectPath', () => {
  const fs = new Set([
    '/Users/nazha/ub/mono-repos/packages/skm',
    '/Users/nazha/ub/mono-repos/packages/travel-maps',
    '/Users/nazha/my-app',
  ]);
  // 目录前缀也必须可判存在？DFS 只在叶子判存在，谓词只需回答完整路径
  const exists = (p: string) => fs.has(p);

  it('decodes a plain path', () => {
    expect(decodeClaudeProjectPath('-Users-nazha-ub-mono-repos-packages-skm', exists)).toBe(
      '/Users/nazha/ub/mono-repos/packages/skm',
    );
  });

  it('disambiguates literal hyphens via existence', () => {
    expect(
      decodeClaudeProjectPath('-Users-nazha-ub-mono-repos-packages-travel-maps', exists),
    ).toBe('/Users/nazha/ub/mono-repos/packages/travel-maps');
    expect(decodeClaudeProjectPath('-Users-nazha-my-app', exists)).toBe('/Users/nazha/my-app');
  });

  it('returns null when nothing exists', () => {
    expect(decodeClaudeProjectPath('-gone-away-project', exists)).toBeNull();
  });

  it('rejects names without leading dash', () => {
    expect(decodeClaudeProjectPath('whatever', exists)).toBeNull();
  });
});

describe('parseCodexSessionIndex', () => {
  it('extracts unique cwds and skips bad lines', () => {
    const content = [
      '{"cwd":"/a/b","ts":1}',
      'not json at all',
      '{"cwd":"/a/b"}',
      '{"workdir":"/c"}',
      '{"cwd":"relative/nope"}',
      '',
    ].join('\n');
    expect(parseCodexSessionIndex(content).sort()).toEqual(['/a/b', '/c']);
  });
});

describe('discoverProjects', () => {
  it('merges, dedupes, honors removedAutoProjects', () => {
    const cfg = {
      ...DEFAULT_SKIM_CONFIG,
      manualProjects: ['/m/one'],
      removedAutoProjects: ['/auto/removed'],
    };
    const out = discoverProjects(
      ['/auto/a', '/auto/removed', '/m/one'],
      ['/auto/a/', '/auto/b'],
      cfg,
    );
    expect(out).toEqual([
      { path: '/auto/a', origin: 'auto-claude' },
      { path: '/auto/b', origin: 'auto-codex' },
      { path: '/m/one', origin: 'manual' },
    ]);
  });

  it('manual wins over auto and survives removal list', () => {
    const cfg = {
      ...DEFAULT_SKIM_CONFIG,
      manualProjects: ['/p'],
      removedAutoProjects: ['/p'],
    };
    expect(discoverProjects(['/p'], [], cfg)).toEqual([{ path: '/p', origin: 'manual' }]);
  });
});
