import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { measure, isLocalHost } from '../skills/performance-audit/scripts/measure-http.mjs';
import { measureBuild, compareBuilds, normalizeName } from '../skills/performance-audit/scripts/bundle-size.mjs';

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'perf-build-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

test('local host detection', () => {
  for (const h of ['localhost', 'app.localhost', '127.0.0.1', '[::1]']) assert.ok(isLocalHost(h), h);
  for (const h of ['example.com', '10.0.0.5', 'localhost.example.com']) assert.ok(!isLocalHost(h), h);
});

test('refuses remote hosts and unsafe methods', async () => {
  await assert.rejects(measure('https://example.com/'), /Refusing non-local host/);
  await assert.rejects(measure('http://127.0.0.1:9/', { method: 'POST' }), /Only GET and HEAD/);
});

test('measures a local server with compression headers', async () => {
  const body = 'x'.repeat(5000);
  const server = createServer((req, res) => {
    const gz = gzipSync(body);
    res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip', 'cache-control': 'max-age=60', 'content-length': gz.length });
    res.end(gz);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const { port } = server.address();
    const r = await measure(`http://127.0.0.1:${port}/`, { runs: 5, warmup: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.samples.length, 5);
    assert.equal(r.headers['content-encoding'], 'gzip');
    assert.equal(r.headers['cache-control'], 'max-age=60');
    assert.equal(r.decodedBytes.median, 5000);
    assert.ok(r.timeToHeaders.median >= 0 && r.total.median >= r.timeToHeaders.median);
  } finally {
    server.close();
  }
});

test('measures a Next.js-style build with per-route totals', () => {
  const big = 'const a = 1;\n'.repeat(2000);
  const dir = tree({
    '.next/static/chunks/main-abc123def456.js': big,
    '.next/static/chunks/pages/index-0011223344556677.js': 'export{}',
    '.next/static/css/app-aabbccddeeff0011.css': 'body{margin:0}',
    '.next/static/chunks/main-abc123def456.js.map': '{}',
    '.next/server/chunks/ssr.js': big,
    '.next/cache/x.js': big,
    '.next/build-manifest.json': JSON.stringify({
      pages: { '/': ['static/chunks/main-abc123def456.js', 'static/chunks/pages/index-0011223344556677.js'], '/_error': [] },
    }),
  });
  try {
    const m = measureBuild(dir);
    assert.equal(m.kind, 'next');
    assert.equal(m.totals.js.files, 2, 'server, cache, and source maps are excluded');
    assert.equal(m.totals.css.files, 1);
    assert.ok(m.totals.js.gzip < m.totals.js.raw);
    assert.deepEqual(m.routes.map((r) => r.route), ['/']);
    assert.equal(m.routes[0].files, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compares builds across content hashes', () => {
  assert.equal(normalizeName('static/chunks/main-abc123def456.js'), normalizeName('static/chunks/main-999888777666.js'));
  const a = tree({ 'dist/assets/index-AbCd1234.js': 'let x = 1;\n'.repeat(3000) });
  const b = tree({ 'dist/assets/index-ZyXw9876.js': 'let x = 1;\n'.repeat(1000) });
  try {
    const c = compareBuilds(measureBuild(b), measureBuild(a));
    assert.ok(c.totals.js.delta < 0);
    assert.equal(c.changes.length, 1);
    assert.equal(c.changes[0].status, 'changed');
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test('reports a clear error when no build exists', () => {
  const dir = tree({ 'src/index.ts': 'export {}' });
  try {
    assert.throws(() => measureBuild(dir), /Run the project's production build first/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
