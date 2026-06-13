import type { ProjectCandidate, SkimConfig } from './types';

/**
 * 解码 ~/.claude/projects/ 的目录名（路径中 "/" 被替换为 "-"，与原有 "-" 混淆）。
 * 纯函数：通过注入的 exists 谓词消歧——DFS 优先把 "-" 解释为路径分隔符，
 * 回退为字面连字符，返回第一个真实存在的目录。
 */
export function decodeClaudeProjectPath(
  encoded: string,
  exists: (path: string) => boolean,
): string | null {
  if (!encoded.startsWith('-')) return null;
  const segments = encoded.slice(1).split('-');

  const dfs = (prefix: string, i: number): string | null => {
    if (i === segments.length) return exists(prefix) ? prefix : null;
    // 分支 1：作为新路径段
    const asDir = dfs(`${prefix}/${segments[i]}`, i + 1);
    if (asDir) return asDir;
    // 分支 2：并入上一段（字面连字符）
    if (prefix !== '') {
      return dfs(`${prefix}-${segments[i]}`, i + 1);
    }
    return null;
  };
  return dfs('', 0);
}

/** 从 Codex session_index.jsonl 内容提取项目 cwd（容错：坏行跳过） */
export function parseCodexSessionIndex(content: string): string[] {
  const out = new Set<string>();
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      const cwd = obj['cwd'] ?? obj['workdir'] ?? obj['cd'];
      if (typeof cwd === 'string' && cwd.startsWith('/')) out.add(cwd);
    } catch {
      // 坏行跳过
    }
  }
  return [...out];
}

/**
 * 汇总候选项目：自动发现（已解码、已被 IO 层校验存在）+ 手动添加，
 * 去重；被用户移除过的自动项目不再出现（manual 不受 removed 影响）。
 */
export function discoverProjects(
  claudeDecoded: string[],
  codexCwds: string[],
  cfg: SkimConfig,
): ProjectCandidate[] {
  const removed = new Set(cfg.removedAutoProjects);
  const seen = new Map<string, ProjectCandidate>();

  for (const p of cfg.manualProjects) {
    seen.set(norm(p), { path: norm(p), origin: 'manual' });
  }
  for (const p of claudeDecoded) {
    const n = norm(p);
    if (!seen.has(n) && !removed.has(n)) seen.set(n, { path: n, origin: 'auto-claude' });
  }
  for (const p of codexCwds) {
    const n = norm(p);
    if (!seen.has(n) && !removed.has(n)) seen.set(n, { path: n, origin: 'auto-codex' });
  }
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function norm(p: string): string {
  return p.replace(/\/+$/, '');
}
