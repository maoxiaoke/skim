// @vitest-environment node
// R3 演练（Claude 侧）：对本机真实 settings.json 的内容副本跑 10 轮 override 增删，
// 断言其余键深等且 skillOverrides 原样恢复。只读真实文件，绝不写回。
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { applyClaudeOverrides } from '../../domain/diff-config';

describe('R3 — claude settings roundtrip on real content copy', () => {
  const path = `${homedir()}/.claude/settings.json`;

  it.skipIf(!existsSync(path))('10 rounds add/remove leaves content semantically identical', () => {
    const original = readFileSync(path, 'utf-8');
    const originalParsed = JSON.parse(original) as Record<string, unknown>;

    let current = original;
    for (let round = 0; round < 10; round++) {
      const withProbe = applyClaudeOverrides(current, { __skim_r3_probe__: 'off' });
      const parsed = JSON.parse(withProbe) as Record<string, unknown>;
      expect((parsed.skillOverrides as Record<string, string>).__skim_r3_probe__).toBe('off');
      // 其余键不受影响
      for (const key of Object.keys(originalParsed)) {
        if (key !== 'skillOverrides') {
          expect(parsed[key]).toEqual(originalParsed[key]);
        }
      }
      current = applyClaudeOverrides(withProbe, { __skim_r3_probe__: null });
    }
    expect(JSON.parse(current)).toEqual(originalParsed);
  });
});
