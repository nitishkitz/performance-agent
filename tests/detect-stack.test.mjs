import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectStack } from '../skills/performance-audit/scripts/detect-stack.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('detects the sample app stack', () => {
  const r = detectStack(join(repo, 'examples/sample-app'));
  assert.equal(r.apps.length, 1);
  const [app] = r.apps;
  assert.deepEqual(app.detected.framework.map((d) => d.package), ['next', 'react', 'react-dom']);
  assert.ok(app.detected.data.some((d) => d.package === '@prisma/client' && !d.dev));
  assert.ok(app.detected.data.some((d) => d.package === 'prisma' && d.dev));
  assert.equal(app.scripts.build, 'next build');
});

test('flags monorepos, lockfiles, dev-server start scripts, and other ecosystems', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-detect-'));
  const write = (rel, content) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  };
  try {
    write('package.json', JSON.stringify({ name: 'root', private: true, workspaces: ['apps/*'] }));
    write('pnpm-lock.yaml', '');
    write('apps/web/package.json', JSON.stringify({ name: 'web', scripts: { start: 'vite' }, dependencies: { vite: '5', vue: '3' } }));
    write('apps/web/vercel.json', '{}');
    write('services/api/requirements.txt', 'fastapi');
    const r = detectStack(dir);
    assert.equal(r.apps.length, 2);
    const web = r.apps.find((a) => a.name === 'web');
    assert.equal(web.packageManager, 'pnpm');
    assert.ok(r.notes.some((n) => n.includes('Multiple package.json')));
    assert.ok(r.notes.some((n) => n.includes('development server')));
    assert.ok(r.configs.some((c) => c.label === 'Vercel'));
    assert.deepEqual(r.otherEcosystems, ['Python']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports router type and notable absences', () => {
  const r = detectStack(join(repo, 'examples/sample-app'));
  const [app] = r.apps;
  assert.ok(app.facts.includes('Next.js router: App Router'));
  for (const needle of ['next.config', 'lockfile', 'node_modules', 'tsconfig.json', 'Prisma schema']) {
    assert.ok(app.absent.some((a) => a.includes(needle)), `expected absence: ${needle}`);
  }
  assert.ok(r.notes.some((n) => n.includes('No hosting or deployment configuration')));
});
