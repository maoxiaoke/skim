import { describe, expect, it } from 'vitest';
import { applyClaudeOverrides } from '../diff-config';

describe('applyClaudeOverrides', () => {
  const REAL = JSON.stringify(
    {
      model: 'claude-fable-5[1m]',
      enabledPlugins: { 'figma@claude-plugins-official': true },
      effortLevel: 'high',
    },
    null,
    2,
  );

  it('adds skillOverrides and preserves unrelated keys', () => {
    const out = applyClaudeOverrides(REAL, { draw: 'name-only' });
    const parsed = JSON.parse(out);
    expect(parsed.skillOverrides).toEqual({ draw: 'name-only' });
    expect(parsed.model).toBe('claude-fable-5[1m]');
    expect(parsed.enabledPlugins['figma@claude-plugins-official']).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('updates and removes entries; drops empty skillOverrides', () => {
    const step1 = applyClaudeOverrides(REAL, { draw: 'off', kami: 'off' });
    const step2 = applyClaudeOverrides(step1, { draw: null });
    expect(JSON.parse(step2).skillOverrides).toEqual({ kami: 'off' });
    const step3 = applyClaudeOverrides(step2, { kami: null });
    expect(JSON.parse(step3)).not.toHaveProperty('skillOverrides');
  });

  it('handles empty / missing file', () => {
    const out = applyClaudeOverrides('', { x: 'off' });
    expect(JSON.parse(out)).toEqual({ skillOverrides: { x: 'off' } });
  });

  it('removing from empty file is a no-op object', () => {
    const out = applyClaudeOverrides('', { x: null });
    expect(JSON.parse(out)).toEqual({});
  });

  it('throws on corrupt JSON and non-object roots', () => {
    expect(() => applyClaudeOverrides('{oops', { x: 'off' })).toThrow();
    expect(() => applyClaudeOverrides('[1,2]', { x: 'off' })).toThrow();
  });

  it('repairs non-object skillOverrides values', () => {
    const out = applyClaudeOverrides('{"skillOverrides": "weird"}', { x: 'off' });
    expect(JSON.parse(out).skillOverrides).toEqual({ x: 'off' });
  });
});
