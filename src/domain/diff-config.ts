import type { SkillStatus } from './types';

export function applyClaudePluginEnabled(
  raw: string,
  pluginKey: string,
  enabled: boolean,
): string {
  const trimmed = raw.trim();
  let root: Record<string, unknown>;
  if (trimmed === '') {
    root = {};
  } else {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings root is not an object');
    }
    root = parsed as Record<string, unknown>;
  }

  const existing = root['enabledPlugins'];
  const plugins: Record<string, unknown> =
    existing !== null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  if (enabled) {
    delete plugins[pluginKey];
  } else {
    plugins[pluginKey] = false;
  }

  if (Object.keys(plugins).length === 0) delete root['enabledPlugins'];
  else root['enabledPlugins'] = plugins;

  return `${JSON.stringify(root, null, 2)}\n`;
}

/**
 * Claude settings.json 的文本级修改（tech-design.md「配置写入策略」）：
 * 只动 skillOverrides 键，其余 JSON 内容保留（结构级；2 空格缩进规范化是已知且向用户披露的损失）。
 * 解析失败抛错 —— 上游应已按 corrupt 降级只读，这里是最后防线。
 */
export function applyClaudeOverrides(
  raw: string,
  set: Record<string, SkillStatus | null>,
): string {
  const trimmed = raw.trim();
  let root: Record<string, unknown>;
  if (trimmed === '') {
    root = {};
  } else {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings root is not an object');
    }
    root = parsed as Record<string, unknown>;
  }

  const existing = root['skillOverrides'];
  const overrides: Record<string, unknown> =
    existing !== null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  for (const [name, status] of Object.entries(set)) {
    if (status === null) delete overrides[name];
    else overrides[name] = status;
  }

  if (Object.keys(overrides).length === 0) delete root['skillOverrides'];
  else root['skillOverrides'] = overrides;

  return `${JSON.stringify(root, null, 2)}\n`;
}
