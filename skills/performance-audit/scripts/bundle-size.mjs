#!/usr/bin/env node
// Measure emitted JavaScript and CSS from an existing production build. Read-only; does not build.
//
// Usage:
//   node bundle-size.mjs <app-root-or-build-dir> [--top 15] [--json]
//   node bundle-size.mjs <candidate> --compare <baseline> [--json]
//
// The build must already exist (for example after the project's own `build` script).
// Recognized output directories: .next, dist, build, out (or pass the directory itself).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { walk, parseArgs, isMainModule } from './lib/walk.mjs';

const ASSET = /\.(m?js|css)$/;
const CANDIDATE_DIRS = ['.next', 'dist', 'build', 'out'];

function findBuildDir(input) {
  const root = resolve(input);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);
  for (const d of CANDIDATE_DIRS) {
    const p = join(root, d);
    if (existsSync(p) && statSync(p).isDirectory()) return { root, dir: p, kind: d === '.next' ? 'next' : 'static' };
  }
  const isNext = existsSync(join(root, 'build-manifest.json')) || existsSync(join(root, 'app-build-manifest.json'));
  if (!isNext && existsSync(join(root, 'package.json'))) {
    // A project root with no recognized output directory: measuring it would count source files as a build.
    throw new Error(`No build output found in ${root} (looked for ${CANDIDATE_DIRS.join(', ')}). Run the project's production build first, or pass the build output directory itself.`);
  }
  return { root, dir: root, kind: isNext ? 'next' : 'static' };
}

function measureFile(path) {
  const buf = readFileSync(path);
  return {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}

/** Strip content hashes so files can be matched across builds. */
export function normalizeName(rel) {
  return rel
    .replace(/(^|\/)static\/[A-Za-z0-9_-]{16,}\//, '$1static/<build>/')
    .replace(/[.-][A-Za-z0-9_]{8,}(?=\.(m?js|css)$)/, '')
    .replace(/[.-][a-f0-9]{6,}(?=[.-])/g, '');
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function nextRoutes(dir, sizes) {
  const routes = [];
  for (const [manifest, router] of [['build-manifest.json', 'pages'], ['app-build-manifest.json', 'app']]) {
    const data = readJson(join(dir, manifest));
    if (!data?.pages) continue;
    for (const [route, files] of Object.entries(data.pages)) {
      if (route.startsWith('/_') && router === 'pages' && route !== '/_app') continue;
      const assets = [...new Set(files)].filter((f) => ASSET.test(f));
      const total = { raw: 0, gzip: 0, brotli: 0 };
      let missing = 0;
      for (const f of assets) {
        const s = sizes.get(f);
        if (!s) {
          missing++;
          continue;
        }
        total.raw += s.raw;
        total.gzip += s.gzip;
        total.brotli += s.brotli;
      }
      routes.push({ router, route, files: assets.length, missing, ...total });
    }
  }
  return routes.sort((a, b) => b.gzip - a.gzip);
}

export function measureBuild(input) {
  const { root, dir, kind } = findBuildDir(input);
  const files = [];
  const sizes = new Map();
  for (const f of walk(dir, { maxFileBytes: 50_000_000, ignore: new Set(['cache', 'node_modules', 'server', 'standalone', 'types']) })) {
    if (!ASSET.test(f.rel)) continue;
    const s = measureFile(f.path);
    files.push({ file: f.rel, type: f.rel.endsWith('.css') ? 'css' : 'js', ...s });
    sizes.set(f.rel, s);
  }
  if (!files.length) throw new Error(`No .js or .css files found under ${dir}. Run the project's production build first.`);
  const totals = {};
  for (const type of ['js', 'css']) {
    const list = files.filter((f) => f.type === type);
    totals[type] = { files: list.length, raw: 0, gzip: 0, brotli: 0 };
    for (const f of list) for (const k of ['raw', 'gzip', 'brotli']) totals[type][k] += f[k];
  }
  files.sort((a, b) => b.gzip - a.gzip);
  const routes = kind === 'next' ? nextRoutes(dir, sizes) : [];
  const notes = [];
  if (kind === 'next' && !routes.length) notes.push('No Next.js build manifests with route data were found (some Next.js versions and Turbopack builds use different manifests); per-route totals are unavailable.');
  if (routes.some((r) => r.missing)) notes.push('Some manifest entries could not be matched to files; affected route totals are lower bounds.');
  notes.push('Totals cover all emitted client assets, not what a single page loads. Use per-route figures or the browser Network panel for initial-load cost.');
  return { root, buildDir: dir, kind, totals, files, routes, notes };
}

export function compareBuilds(candidate, baseline) {
  const byName = (m) => {
    const map = new Map();
    for (const f of m.files) {
      const key = normalizeName(f.file);
      const prev = map.get(key) || { raw: 0, gzip: 0, brotli: 0 };
      map.set(key, { raw: prev.raw + f.raw, gzip: prev.gzip + f.gzip, brotli: prev.brotli + f.brotli });
    }
    return map;
  };
  const a = byName(baseline);
  const b = byName(candidate);
  const changes = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const before = a.get(key)?.gzip ?? 0;
    const after = b.get(key)?.gzip ?? 0;
    if (before !== after) changes.push({ file: key, before, after, delta: after - before, status: !a.has(key) ? 'added' : !b.has(key) ? 'removed' : 'changed' });
  }
  changes.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const totals = {};
  for (const type of ['js', 'css']) {
    const before = baseline.totals[type].gzip;
    const after = candidate.totals[type].gzip;
    totals[type] = { before, after, delta: after - before, deltaPct: before ? ((after - before) / before) * 100 : null };
  }
  return { totals, changes };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
const signedKb = (n) => `${n >= 0 ? '+' : '-'}${kb(Math.abs(n))}`;

function report(m, top) {
  const lines = [`# Build size: \`${m.buildDir}\``, ''];
  lines.push('| Type | Files | Raw | gzip -9 | brotli q11 |', '|---|---|---|---|---|');
  for (const [type, t] of Object.entries(m.totals)) lines.push(`| ${type} | ${t.files} | ${kb(t.raw)} | ${kb(t.gzip)} | ${kb(t.brotli)} |`);
  lines.push('', `## Largest ${Math.min(top, m.files.length)} files (by gzip)`, '', '| File | Raw | gzip | brotli |', '|---|---|---|---|');
  for (const f of m.files.slice(0, top)) lines.push(`| \`${f.file}\` | ${kb(f.raw)} | ${kb(f.gzip)} | ${kb(f.brotli)} |`);
  if (m.routes.length) {
    lines.push('', `## Heaviest ${Math.min(top, m.routes.length)} routes (client assets listed in Next.js manifests)`, '', '| Router | Route | Files | gzip | brotli |', '|---|---|---|---|---|');
    for (const r of m.routes.slice(0, top)) lines.push(`| ${r.router} | \`${r.route}\` | ${r.files} | ${kb(r.gzip)} | ${kb(r.brotli)} |`);
  }
  lines.push('', ...m.notes.map((n) => `_${n}_`), '', '_Compression levels here are upper bounds; servers and CDNs often use lower levels. Check the served `content-encoding` for real transfer size._');
  return lines.join('\n');
}

function compareReport(c, top) {
  const lines = ['# Build size comparison (gzip)', '', '| Type | Baseline | Candidate | Change |', '|---|---|---|---|'];
  for (const [type, t] of Object.entries(c.totals)) {
    lines.push(`| ${type} | ${kb(t.before)} | ${kb(t.after)} | ${signedKb(t.delta)}${t.deltaPct === null ? '' : ` (${t.deltaPct >= 0 ? '+' : ''}${t.deltaPct.toFixed(1)}%)`} |`);
  }
  if (c.changes.length) {
    lines.push('', `## Largest ${Math.min(top, c.changes.length)} file changes (hashes stripped for matching)`, '', '| File | Status | Before | After | Change |', '|---|---|---|---|---|');
    for (const x of c.changes.slice(0, top)) lines.push(`| \`${x.file}\` | ${x.status} | ${kb(x.before)} | ${kb(x.after)} | ${signedKb(x.delta)} |`);
  }
  lines.push('', '_Byte sizes are deterministic for a given build, so one build per condition suffices; confirm the build mode and environment match._');
  return lines.join('\n');
}

if (isMainModule(import.meta.url)) {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || !positional[0]) {
    console.log('Usage: node bundle-size.mjs <app-root-or-build-dir> [--top 15] [--json]\n       node bundle-size.mjs <candidate> --compare <baseline> [--json]');
    process.exit(flags.help ? 0 : 2);
  }
  const top = Number(flags.top) || 15;
  try {
    const candidate = measureBuild(positional[0]);
    if (typeof flags.compare === 'string') {
      const result = compareBuilds(candidate, measureBuild(flags.compare));
      console.log(flags.json ? JSON.stringify(result, null, 2) : compareReport(result, top));
    } else {
      console.log(flags.json ? JSON.stringify(candidate, null, 2) : report(candidate, top));
    }
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
