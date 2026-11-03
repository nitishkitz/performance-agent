// Consistency checks for the skill package: frontmatter, check IDs, anchors, links, and rule references.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../skills/performance-audit/scripts/scan.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(repo, 'skills/performance-audit');
const refs = join(skillDir, 'references');
const TOTAL = 45;
const read = (p) => readFileSync(p, 'utf8');

const slug = (heading) =>
  heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

function markdownFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('SKILL.md frontmatter is valid', () => {
  const text = read(join(skillDir, 'SKILL.md'));
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'frontmatter missing');
  const name = m[1].match(/^name:\s*(.+)$/m)?.[1].trim();
  const description = m[1].match(/^description:\s*(.+)$/m)?.[1].trim();
  assert.equal(name, 'performance-audit');
  assert.ok(/^[a-z0-9-]{1,64}$/.test(name));
  assert.ok(description && description.length <= 1024, 'description missing or longer than 1024 characters');
  assert.ok(!/[<>]/.test(description), 'description must not contain angle brackets');
  assert.ok(text.split('\n').length < 500, 'SKILL.md should stay under 500 lines');
});

test('checklist index lists IDs 1..45 exactly once with resolvable anchors', () => {
  const index = read(join(refs, 'checklist.md'));
  const rows = [...index.matchAll(/^\| (\d+) \| [^|]+ \| \[\w+\]\(([\w-]+\.md)#([^)]+)\) \|$/gm)];
  assert.deepEqual(rows.map((r) => Number(r[1])), Array.from({ length: TOTAL }, (_, i) => i + 1));
  for (const [, id, file, anchor] of rows) {
    const target = join(refs, file);
    assert.ok(existsSync(target), `missing ${file}`);
    const headings = [...read(target).matchAll(/^## (.+)$/gm)].map((h) => slug(h[1]));
    assert.ok(headings.includes(anchor), `check ${id}: anchor #${anchor} not found in ${file}`);
  }
});

test('each check has exactly one detail section with all four fields', () => {
  const seen = new Map();
  for (const file of readdirSync(refs).filter((f) => f.startsWith('checks-'))) {
    const text = read(join(refs, file));
    const sections = text.split(/^## /m).slice(1);
    for (const section of sections) {
      const id = Number(section.match(/^(\d+)\./)?.[1]);
      assert.ok(id, `${file}: section without numeric ID`);
      assert.ok(!seen.has(id), `check ${id} defined in ${seen.get(id)} and ${file}`);
      seen.set(id, file);
      for (const field of ['Signals', 'Measure', 'Interventions', 'Pitfalls']) {
        assert.ok(section.includes(`**${field}:**`), `check ${id} missing ${field}`);
      }
    }
  }
  assert.equal(seen.size, TOTAL);
});

test('scanner rules and documentation reference each other', () => {
  const docs = readdirSync(refs).filter((f) => f.startsWith('checks-')).map((f) => read(join(refs, f))).join('\n');
  const referenced = new Set([...docs.matchAll(/\[`([a-z0-9-]+)`\]/g)].map((m) => m[1]));
  const ruleIds = new Set(RULES.map((r) => r.id));
  for (const id of referenced) assert.ok(ruleIds.has(id), `docs reference unknown rule ${id}`);
  for (const id of ruleIds) assert.ok(referenced.has(id), `rule ${id} is not documented in any check`);
});

test('relative markdown links resolve', () => {
  for (const file of markdownFiles(repo)) {
    const text = read(file);
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const [path, anchor] = target.split('#');
      const resolved = resolve(dirname(file), path);
      assert.ok(existsSync(resolved), `${relative(repo, file)} links to missing ${target}`);
      if (anchor && resolved.endsWith('.md')) {
        const headings = [...read(resolved).matchAll(/^#{1,6} (.+)$/gm)].map((h) => slug(h[1]));
        assert.ok(headings.includes(anchor), `${relative(repo, file)} links to missing anchor ${target}`);
      }
    }
  }
});

test('documented check count is consistent', () => {
  for (const rel of ['README.md', 'skills/performance-audit/references/checklist.md', 'skills/performance-audit/references/report-template.md']) {
    const text = read(join(repo, rel));
    assert.ok(!/\b31 (performance )?checks\b/i.test(text), `${rel} still mentions 31 checks`);
    assert.ok(/\b45\b/.test(text), `${rel} should mention 45 checks`);
  }
});

test('README states the real scanner rule count', () => {
  const readme = read(join(repo, 'README.md'));
  assert.ok(readme.includes(`${RULES.length} read-only heuristics`), `README should mention ${RULES.length} read-only heuristics`);
});
