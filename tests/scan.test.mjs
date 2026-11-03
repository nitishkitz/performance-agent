import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, RULES } from '../skills/performance-audit/scripts/scan.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sample = join(repo, 'examples/sample-app');

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'perf-scan-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const keys = (result) => result.candidates.map((c) => `${c.rule} ${c.file}:${c.line}`).sort();

test('detects every planted issue in the sample app and nothing else', () => {
  const expected = [
    'await-in-loop app/api/orders/route.ts:9',
    'client-root-layout app/layout.tsx:1',
    'css-import-font styles/globals.css:1',
    'effect-fetch components/Header.tsx:8',
    'effect-fetch components/Profile.tsx:9',
    'fetch-no-timeout app/api/orders/route.ts:14',
    'heavy-import lib/format.ts:1',
    'img-missing-dimensions app/page.tsx:7',
    'interval-no-clear components/LiveClock.tsx:9',
    'layout-transition styles/globals.css:9',
    'lazy-image app/page.tsx:7',
    'sequential-await app/dashboard/page.tsx:4',
    'sync-fs-server app/api/orders/route.ts:5',
    'unbounded-findmany app/api/orders/route.ts:6',
  ].sort();
  assert.deepEqual(keys(scan(sample)), expected);
});

test('does not flag well-formed equivalents', () => {
  const dir = fixture({
    'app/page.tsx': [
      'export default function Page() {',
      '  return <img src="/a.png" width={10} height={10} alt="" />;',
      '}',
    ].join('\n'),
    'app/api/data/route.ts': [
      'export async function GET() {',
      "  const [a, b] = await Promise.all([fetch('https://x.test', { signal: AbortSignal.timeout(2000) }), load()]);",
      '  for await (const chunk of stream()) consume(chunk);',
      '  for (const item of items) total += item.price;',
      '  for (const id of ids) results.push(cache.get(id));',
      "  const user = await getUser();",
      '  const orders = await getOrders(user.id);',
      '  return Response.json({ a, b, orders });',
      '}',
    ].join('\n'),
    'components/Timer.tsx': [
      'useEffect(() => {',
      '  const id = setInterval(tick, 1000);',
      "  window.addEventListener('resize', onResize);",
      "  return () => { clearInterval(id); window.removeEventListener('resize', onResize); };",
      '}, []);',
    ].join('\n'),
    'index.html': '<script src="/app.js" defer></script><script type="module" src="/m.js"></script>',
    'styles/site.css': '.card { transition: transform 200ms, opacity 200ms; }',
    'scripts/build.mjs': "import { readFileSync } from 'node:fs';\nreadFileSync('x');",
    'node_modules/pkg/index.js': 'for (const x of y) { await prisma.user.findMany(); }',
  });
  try {
    assert.deepEqual(keys(scan(dir)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('braceless loop bodies are analyzed in isolation', () => {
  const dir = fixture({
    'src/a.js': 'for (const e of events) handle(e);\nconst next = await later();',
  });
  try {
    assert.equal(scan(dir).candidates.filter((c) => c.rule === 'await-in-loop').length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--checks filter limits rules', () => {
  const result = scan(sample, { checks: [39] });
  assert.deepEqual(result.rulesApplied, ['interval-no-clear', 'listener-no-remove']);
  assert.ok(result.candidates.every((c) => c.checks.includes(39)));
});

test('snippets redact secret-looking values', () => {
  const dir = fixture({
    'app/api/x/route.ts': "const r = await fetch('https://api.test', { headers: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456' } });",
  });
  try {
    const [c] = scan(dir).candidates;
    assert.equal(c.rule, 'fetch-no-timeout');
    assert.ok(!c.snippet.includes('abcdefghijklmnopqrstuvwxyz123456'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every rule maps to valid check IDs', () => {
  const ids = new Set();
  for (const rule of RULES) {
    assert.ok(!ids.has(rule.id), `duplicate rule ${rule.id}`);
    ids.add(rule.id);
    assert.ok(rule.checks.length > 0);
    for (const c of rule.checks) assert.ok(Number.isInteger(c) && c >= 1 && c <= 45, `${rule.id}: bad check ${c}`);
  }
});

test('precision regressions found on real repositories stay fixed', () => {
  const dir = fixture({
    // Harmless namespace imports (React, zod) are not heavy imports; icon-set namespaces are.
    'src/ui.tsx': 'import * as React from "react";\nimport * as z from "zod";\nimport * as Icons from "lucide-react";',
    // <img> mentioned in a comment, and a helper named addEventListener.
    'src/util.ts': [
      '/**',
      ' * Fails during <img> element creation',
      ' */',
      'export function addEventListener(target, type, fn) {',
      '  target.addEventListener(type, fn);',
      '  return () => target.removeEventListener(type, fn);',
      '}',
    ].join('\n'),
    // Awaiting already-started promises or plain properties is not serialization.
    'src/page.tsx': [
      'const a = fetchA();',
      'const resA = await a',
      'const params = await props.params;',
      'const resB = await loadB()',
    ].join('\n'),
    // Bundled asset fetch on the server is not a remote dependency.
    'app/api/og/route.tsx': "const font = fetch(new URL('./Inter.ttf', import.meta.url)).then((r) => r.arrayBuffer());",
    // Synchronous reads outside request handlers (build-time env loading).
    'packages/lib/env.cjs': "const env = readFileSync('.env', 'utf8');",
    // Test files are skipped by default.
    'src/a.test.ts': 'for (const x of xs) { await prisma.user.findMany(); }',
  });
  try {
    const result = keys(scan(dir));
    assert.deepEqual(result, ['heavy-import src/ui.tsx:3']);
    assert.ok(keys(scan(dir, { includeTests: true })).includes('await-in-loop src/a.test.ts:1'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('nested loops report only the innermost loop', () => {
  const dir = fixture({
    'src/clip.ts': ['for (const item of items) {', '  for (const type of item.types) {', '    await item.getType(type);', '  }', '}'].join('\n'),
  });
  try {
    assert.deepEqual(keys(scan(dir)), ['await-in-loop src/clip.ts:2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auxiliary paths are downgraded to low confidence', () => {
  const dir = fixture({ 'examples/demo/a.tsx': 'useEffect(() => {\n  fetch("/x");\n}, []);' });
  try {
    const [c] = scan(dir).candidates;
    assert.equal(c.rule, 'effect-fetch');
    assert.equal(c.confidence, 'low');
    assert.match(c.note, /auxiliary/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cross-file passes: duplicate effect URLs and unreachable heavy imports', () => {
  const sample = scan(join(repo, 'examples/sample-app')).candidates;
  const header = sample.find((c) => c.rule === 'effect-fetch' && c.file === 'components/Header.tsx');
  assert.match(header.note, /same URL \/api\/profile also fetched .*Profile\.tsx:9/);
  const lodash = sample.find((c) => c.rule === 'heavy-import');
  assert.equal(lodash.confidence, 'medium', 'lib/format.ts is imported by Profile.tsx');

  const dir = fixture({ 'src/unused.ts': "import _ from 'lodash';\nexport const f = _.noop;", 'src/main.ts': "import { x } from './other';" });
  try {
    const [c] = scan(dir).candidates;
    assert.equal(c.confidence, 'low');
    assert.match(c.note, /may be unreachable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync fs at module scope is low confidence; inside a handler it is medium', () => {
  const dir = fixture({
    'app/api/a/route.ts': "const cfg = readFileSync('c.json');\nexport async function GET() {\n  const d = readFileSync('d.json');\n}",
  });
  try {
    const got = scan(dir).candidates.map((c) => `${c.line}:${c.confidence}`);
    assert.deepEqual(got.sort(), ['1:low', '3:medium']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports skipped file counts', () => {
  const r = scan(join(repo, 'examples/sample-app'));
  assert.equal(r.skipped.unsupportedType, 2); // package.json, README.md
});
