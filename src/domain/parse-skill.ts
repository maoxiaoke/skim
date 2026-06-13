// SKILL.md frontmatter 解析 — 纯函数。不引第三方 yaml 库：
// skills 生态的 frontmatter 实际只用 `key: value` 平铺（含多行折行值），手解析足够且零依赖。

export interface ParsedFrontmatter {
  name: string | null;
  description: string | null;
  /** frontmatter 区块存在且可解析 */
  ok: boolean;
}

export function parseFrontmatter(skillMdHead: string): ParsedFrontmatter {
  const none: ParsedFrontmatter = { name: null, description: null, ok: false };
  if (!skillMdHead.startsWith('---')) return none;
  const end = skillMdHead.indexOf('\n---', 3);
  if (end === -1) return none;
  const block = skillMdHead.slice(skillMdHead.indexOf('\n') + 1, end);

  const fields: Record<string, string> = {};
  let currentKey: string | null = null;
  for (const line of block.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) {
      currentKey = m[1].toLowerCase();
      const v = m[2].trim();
      // 块标量指示符（>- > | |-）：值在后续缩进行里，指示符本身不是内容
      fields[currentKey] = /^[>|][+-]?$/.test(v) ? '' : v;
    } else if (currentKey && /^\s+\S/.test(line)) {
      // YAML 折行续行（块标量或普通折行）
      const prev = fields[currentKey];
      fields[currentKey] = prev ? `${prev} ${line.trim()}` : line.trim();
    } else {
      currentKey = null;
    }
  }

  const unquote = (v: string | undefined): string | null => {
    if (v === undefined) return null;
    const t = v.trim();
    if (t === '') return null;
    const q = /^(['"])(.*)\1$/.exec(t);
    return (q ? q[2] : t) || null;
  };

  return {
    name: unquote(fields['name']),
    description: unquote(fields['description']),
    ok: true,
  };
}

export interface ParsedSkillDir {
  name: string;
  description: string | null;
  parseError: boolean;
}

/** 目录快照 → 名称/描述/解析状态。skillMdHead 为 null 表示目录里没有 SKILL.md */
export function parseSkillDir(dirName: string, skillMdHead: string | null): ParsedSkillDir {
  if (skillMdHead === null) {
    return { name: dirName, description: null, parseError: true };
  }
  const fm = parseFrontmatter(skillMdHead);
  return {
    name: fm.name ?? dirName,
    description: fm.description,
    parseError: !fm.ok,
  };
}
