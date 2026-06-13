import { describe, expect, it } from 'vitest';
import { parseFrontmatter, parseSkillDir } from '../parse-skill';

describe('parseFrontmatter', () => {
  it('parses plain key-values', () => {
    const fm = parseFrontmatter('---\nname: alpha\ndescription: A test skill\n---\n# Body');
    expect(fm).toEqual({ name: 'alpha', description: 'A test skill', ok: true });
  });

  it('unquotes quoted values', () => {
    const fm = parseFrontmatter('---\nname: "pdf"\ndescription: \'Use when X\'\n---\n');
    expect(fm.name).toBe('pdf');
    expect(fm.description).toBe('Use when X');
  });

  it('handles block scalar indicators (>- > | |-)', () => {
    for (const ind of ['>-', '>', '|', '|-']) {
      const fm = parseFrontmatter(`---\nname: adapt\ndescription: ${ind}\n  Adapt designs across\n  breakpoints and devices.\n---\n`);
      expect(fm.description, ind).toBe('Adapt designs across breakpoints and devices.');
    }
  });

  it('joins folded multi-line values', () => {
    const fm = parseFrontmatter(
      '---\nname: long\ndescription: first line\n  second line\n  third\n---\n',
    );
    expect(fm.description).toBe('first line second line third');
  });

  it('ignores extra fields and keeps known ones', () => {
    const fm = parseFrontmatter('---\nversion: 1.0.0\nname: x\ntrigger: when testing\n---\n');
    expect(fm.name).toBe('x');
    expect(fm.description).toBeNull();
  });

  it('rejects content without frontmatter', () => {
    expect(parseFrontmatter('# Just markdown').ok).toBe(false);
    expect(parseFrontmatter('---\nunterminated').ok).toBe(false);
    expect(parseFrontmatter('').ok).toBe(false);
  });

  it('treats empty description as null', () => {
    const fm = parseFrontmatter('---\nname: x\ndescription:\n---\n');
    expect(fm.description).toBeNull();
  });
});

describe('parseSkillDir', () => {
  it('falls back to dir name when frontmatter has no name', () => {
    const p = parseSkillDir('my-dir', '---\ndescription: d\n---\n');
    expect(p.name).toBe('my-dir');
    expect(p.parseError).toBe(false);
  });

  it('flags parseError when SKILL.md missing', () => {
    const p = parseSkillDir('no-manifest', null);
    expect(p).toEqual({ name: 'no-manifest', description: null, parseError: true });
  });

  it('flags parseError when frontmatter malformed but keeps dir name', () => {
    const p = parseSkillDir('broken', 'no frontmatter here');
    expect(p.parseError).toBe(true);
    expect(p.name).toBe('broken');
  });
});
