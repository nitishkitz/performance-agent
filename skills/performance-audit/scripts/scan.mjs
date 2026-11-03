#!/usr/bin/env node
// Read-only candidate scanner for performance-audit.
// Usage: node scan.mjs [app-root] [--json] [--checks 3,8] [--max-per-rule 25] [--include-tests] [--list-rules]
// Test, spec, story, and mock files are skipped unless --include-tests is given.
//
// Every result is a CANDIDATE for human/agent inspection, not a finding.
// Heuristics are line- and file-level text patterns; they cannot see runtime
// behavior, deployment configuration, or code in other modules.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { walk, parseArgs, isMainModule } from './lib/walk.mjs';

const CODE = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro'];
const MARKUP = ['.jsx', '.tsx', '.html', '.htm', '.vue', '.svelte', '.astro'];
const STYLE = ['.css', '.scss', '.sass', '.less'];
const SQL_HOSTS = [...CODE, '.sql'];
const ALL_EXT = new Set([...CODE, ...MARKUP, ...STYLE, '.sql']);

// Never shipped: skipped unless --include-tests.
const TEST_PATH = /(^|\/)(test|tests|__tests__|__mocks__|e2e|cypress|playwright|fixtures)\/|\.(test|spec|stories|e2e)\.[cm]?[jt]sx?$/;
// Shipped rarely or never to users: reported, but downgraded to low confidence.
const AUX_PATH = /(^|\/)(examples?|demos?|docs?|scripts|tools|storybook|\.storybook|benchmarks?)\//;
const HANDLER_TEXT = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|loader|action|getServerSideProps)\b|\b(app|router|server|fastify)\.(get|post|put|patch|delete|all|use|route)\s*\(|\(\s*req\s*,\s*res\b/;
const NON_RUNTIME_PATH = /(^|\/)(scripts|tools|test|tests|__tests__|__mocks__|e2e|cypress|playwright|fixtures|migrations|seed|seeds)\/|\.(test|spec|stories|config)\.[cm]?[jt]sx?$|(^|\/)[^/]*\.config\.[cm]?[jt]s$/;
const SERVER_PATH = /(^|\/)(api|server|servers|routes|controllers|handlers|services|resolvers|actions|lib\/server|backend)\/|(^|\/)route\.[cm]?[jt]s$|\.server\.[cm]?[jt]sx?$|(^|\/)middleware\.[cm]?[jt]s$/;

const isComment = (line) => /^\s*(\/\/|\*|\/\*|#|--)/.test(line);
const extOf = (rel) => {
  const m = rel.match(/(\.[^./]+)$/);
  return m ? m[1].toLowerCase() : '';
};
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Return the text of the block that opens at or after (`start`, `col`), found by
 * brace counting and capped at `maxLines`. Braces inside strings are not parsed;
 * this is a heuristic.
 */
function blockText(lines, start, col = 0, maxLines = 40) {
  let depth = 0;
  let opened = false;
  const out = [];
  for (let i = start; i < Math.min(lines.length, start + maxLines); i++) {
    const segment = i === start ? lines[i].slice(col) : lines[i];
    for (let j = 0; j < segment.length; j++) {
      const ch = segment[j];
      if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
        if (opened && depth <= 0) {
          out.push(segment.slice(0, j + 1));
          return out.join('\n');
        }
      }
    }
    out.push(segment);
  }
  return out.join('\n');
}

/** Body of a `for`/`while` loop whose keyword starts at (`start`, `col`). Handles braceless single-statement bodies. */
function loopBody(lines, start, col) {
  const line = lines[start];
  const open = line.indexOf('(', col);
  if (open !== -1) {
    let depth = 0;
    for (let j = open; j < line.length; j++) {
      if (line[j] === '(') depth++;
      else if (line[j] === ')' && --depth === 0) {
        const rest = line.slice(j + 1).trimStart();
        if (rest && !rest.startsWith('{')) return rest.split(';')[0];
        break;
      }
    }
  }
  return blockText(lines, start, col, 30);
}

function perLine(ctx, regex, { skipComments = true } = {}) {
  const hits = [];
  ctx.lines.forEach((line, i) => {
    if (skipComments && isComment(line)) return;
    if (regex.test(line)) hits.push({ line: i + 1 });
  });
  return hits;
}

const DATA_CALL = /\b(prisma|db|knex|sql|pool|client|repo|repository|model|supabase)\b[\w.]*\.(find\w*|query|select|insert|update|upsert|delete|count|aggregate|from|execute|get)\s*\(|\bfetch\s*\(|\baxios\b|\.(findOne|findById|findUnique|findFirst|findAll|findMany)\s*\(/;

export const RULES = [
  {
    id: 'effect-fetch',
    checks: [3, 32],
    confidence: 'medium',
    exts: CODE,
    summary: 'Network request inside useEffect; check for duplicate reads and fetch-on-render waterfalls.',
    run(ctx) {
      const hits = [];
      ctx.lines.forEach((line, i) => {
        const m = line.match(/\buseEffect\s*\(/);
        if (!m || isComment(line)) return;
        const body = blockText(ctx.lines, i, m.index, 30);
        if (!/\bfetch\s*\(|\baxios\b|\$fetch\s*\(|\bky\s*[.(]/.test(body)) return;
        const url = body.match(/(?:\bfetch|\baxios(?:\.get)?|\$fetch)\s*\(\s*(["'`])([^"'`$]+)\1/)?.[2];
        hits.push({ line: i + 1, ...(url ? { key: url } : {}) });
      });
      return hits;
    },
  },
  {
    id: 'sequential-await',
    checks: [16, 32],
    confidence: 'low',
    exts: CODE,
    summary: 'Consecutive awaited assignments where the second does not use the first result; possibly independent and parallelizable.',
    run(ctx) {
      const hits = [];
      const re = /^\s*(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[\w$]+)\s*(?::[^=]+)?=\s*await\s+(.+)$/;
      for (let i = 0; i < ctx.lines.length - 1; i++) {
        const a = ctx.lines[i].match(re);
        const b = ctx.lines[i + 1].match(re);
        if (!a || !b) continue;
        // Awaiting an already-started promise or a plain property is not a serialization candidate.
        if (!/[\w$\])]\s*\(/.test(a[2]) || !/[\w$\])]\s*\(/.test(b[2]) || /^Promise\./.test(a[2].trim())) continue;
        const names = a[1].replace(/[{}[\]\s]/g, '').split(',').map((n) => n.split(':').pop()).filter(Boolean);
        const usesPrevious = names.some((n) => new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(b[2]));
        if (!usesPrevious) hits.push({ line: i + 1 });
      }
      return hits;
    },
  },
  {
    id: 'await-in-loop',
    checks: [8, 16],
    confidence: 'medium',
    exts: CODE,
    summary: 'await inside a loop body; check for N+1 queries or serialized independent requests.',
    run(ctx) {
      const hits = [];
      ctx.lines.forEach((line, i) => {
        if (isComment(line)) return;
        const m = line.match(/\b(for|while)\s*\(|\.forEach\s*\(\s*async\b/);
        if (!m) return;
        if (/\bfor\s+await\s*\(/.test(line.slice(Math.max(0, m.index - 1)))) return; // async iteration is intentionally sequential
        const body = (m[1] ? loopBody(ctx.lines, i, m.index) : blockText(ctx.lines, i, m.index, 30)).split('\n');
        const endLine = i + body.length; // 1-based last line of the body
        if (!body.some((l) => /\bawait\b/.test(l) && !isComment(l))) return;
        const dataLike = body.some((l) => /\bawait\b/.test(l) && DATA_CALL.test(l));
        hits.push({ line: i + 1, endLine, note: dataLike ? 'awaited call looks like data access' : undefined, confidence: dataLike ? 'medium' : 'low' });
      });
      // Report only the innermost loop when loops are nested.
      return hits.filter((h) => !hits.some((o) => o !== h && o.line > h.line && o.line <= h.endLine));
    },
  },
  {
    id: 'img-missing-dimensions',
    checks: [2, 37],
    confidence: 'medium',
    exts: MARKUP,
    summary: '<img> without both width and height; risks layout shift unless CSS reserves the space, and may hide oversized downloads.',
    run(ctx) {
      const hits = [];
      const re = /<img\b/g;
      let m;
      while ((m = re.exec(ctx.text))) {
        const close = ctx.text.indexOf('>', m.index);
        const tag = ctx.text.slice(m.index, close === -1 ? undefined : close + 1);
        if (/\{\s*\.\.\./.test(tag)) continue; // spread props may supply dimensions
        if (/^<img\s*>$/.test(tag)) continue; // bare tag, usually prose in a comment or string
        const at = lineAt(ctx.text, m.index);
        if (isComment(ctx.lines[at - 1])) continue;
        if (/\bwidth\s*=/.test(tag) && /\bheight\s*=/.test(tag)) continue;
        hits.push({ line: at });
      }
      return hits;
    },
  },
  {
    id: 'lazy-image',
    checks: [15],
    confidence: 'low',
    exts: MARKUP,
    summary: 'loading="lazy" in use; verify it is not applied to the LCP or above-the-fold image.',
    run: (ctx) => perLine(ctx, /\bloading\s*=\s*\{?\s*["'`]lazy["'`]/),
  },
  {
    id: 'fetch-no-timeout',
    checks: [12],
    confidence: 'low',
    exts: CODE,
    summary: 'Server-side fetch without an AbortSignal/timeout in the call; a slow dependency can hold the request open.',
    run(ctx) {
      if (!SERVER_PATH.test(ctx.rel)) return [];
      const hits = [];
      ctx.lines.forEach((line, i) => {
        if (isComment(line) || !/(^|[^\w.$])fetch\s*\(/.test(line)) return;
        const call = ctx.lines.slice(i, i + 8).join('\n');
        if (/\bsignal\b|\btimeout\b/i.test(call)) return;
        if (/import\.meta\.url/.test(call)) return; // bundled local asset, not a remote dependency
        hits.push({ line: i + 1 });
      });
      return hits;
    },
  },
  {
    id: 'heavy-import',
    checks: [11, 35],
    confidence: 'medium',
    exts: CODE,
    summary: 'Whole-library import of a large package; confirm bundle impact in build output.',
    run(ctx) {
      const hits = [];
      ctx.lines.forEach((line, i) => {
        if (isComment(line)) return;
        if (/\bfrom\s+["'](lodash|moment|moment-timezone)["']|require\(\s*["'](lodash|moment|moment-timezone)["']\s*\)/.test(line)) {
          hits.push({ line: i + 1 });
        } else if (/^\s*import\s+\*\s+as\s+[\w$]+\s+from\s+["'](lucide-react|react-icons\/\w+|@heroicons\/react\/[\w/]+|@tabler\/icons-react|@mui\/icons-material|@fortawesome\/free-[\w-]+)["']/.test(line)) {
          hits.push({ line: i + 1, note: 'namespace import of an icon set; dynamic access such as Icons[name] defeats tree-shaking' });
        }
      });
      return hits;
    },
  },
  {
    id: 'select-star',
    checks: [24, 40],
    confidence: 'medium',
    exts: SQL_HOSTS,
    summary: 'SELECT * query; check for over-fetching of wide or large columns.',
    run: (ctx) => perLine(ctx, /\bselect\s+\*\s+from\b/i, { skipComments: false }),
  },
  {
    id: 'unbounded-findmany',
    checks: [5, 24],
    confidence: 'medium',
    exts: CODE,
    summary: 'List query with no arguments (no limit, filter, or field selection).',
    run: (ctx) => perLine(ctx, /\.(findMany|findAll)\s*\(\s*\)/),
  },
  {
    id: 'sync-fs-server',
    checks: [38],
    confidence: 'low',
    exts: CODE,
    summary: 'Synchronous filesystem or child-process call in server or request-handler code; blocks the event loop if it runs per request.',
    run(ctx) {
      if (NON_RUNTIME_PATH.test(ctx.rel)) return [];
      if (!SERVER_PATH.test(ctx.rel) && !HANDLER_TEXT.test(ctx.text)) return [];
      return perLine(ctx, /\b(readFileSync|writeFileSync|appendFileSync|readdirSync|execSync|spawnSync)\s*\(/).map((h) =>
        /^\S/.test(ctx.lines[h.line - 1])
          ? { ...h, note: 'module scope; usually runs once at startup' }
          : { ...h, confidence: 'medium', note: 'inside a function in server or handler code; confirm it runs per request' },
      );
    },
  },
  {
    id: 'interval-no-clear',
    checks: [39],
    confidence: 'medium',
    exts: CODE,
    summary: 'setInterval in a file with no clearInterval; possible leak or runaway timer.',
    run(ctx) {
      if (/\bclearInterval\s*\(/.test(ctx.text)) return [];
      return perLine(ctx, /\bsetInterval\s*\(/);
    },
  },
  {
    id: 'listener-no-remove',
    checks: [39],
    confidence: 'low',
    exts: CODE,
    summary: 'addEventListener in a file with no removeEventListener, AbortSignal, or once option.',
    run(ctx) {
      if (/\bremoveEventListener\s*\(|\bsignal\s*[:,}]|\bonce\s*:\s*true/.test(ctx.text)) return [];
      return perLine(ctx, /\.addEventListener\s*\(/);
    },
  },
  {
    id: 'deep-clone-json',
    checks: [36],
    confidence: 'low',
    exts: CODE,
    summary: 'JSON round-trip cloning; costly for large objects on the main thread.',
    run: (ctx) => perLine(ctx, /JSON\.parse\(\s*JSON\.stringify\(/),
  },
  {
    id: 'client-root-layout',
    checks: [20, 22, 34],
    confidence: 'medium',
    exts: ['.js', '.jsx', '.ts', '.tsx'],
    summary: '"use client" at an App Router layout or page; that file and everything it imports become client JavaScript (server components passed in as children can stay server-rendered), and metadata exports are unavailable.',
    run(ctx) {
      if (!/(^|\/)app\/(.*\/)?(layout|page|template)\.[jt]sx?$/.test(ctx.rel)) return [];
      const first = ctx.lines.findIndex((l) => l.trim() && !isComment(l));
      if (first !== -1 && /^\s*["']use client["'];?\s*$/.test(ctx.lines[first])) return [{ line: first + 1 }];
      return [];
    },
  },
  {
    id: 'blocking-script',
    checks: [21, 33],
    confidence: 'medium',
    exts: MARKUP,
    summary: 'External script without async/defer/module, or a beforeInteractive script strategy.',
    run(ctx) {
      const hits = [];
      const re = /<script\b[^>]*>/g;
      let m;
      while ((m = re.exec(ctx.text))) {
        const tag = m[0];
        if (!/\bsrc\s*=/.test(tag)) continue;
        if (/\b(async|defer)\b|type\s*=\s*["']module["']/.test(tag)) continue;
        hits.push({ line: lineAt(ctx.text, m.index) });
      }
      for (const h of perLine(ctx, /\bstrategy\s*=\s*\{?\s*["']beforeInteractive["']/)) {
        hits.push({ ...h, confidence: 'low', note: 'beforeInteractive delays hydration; confirm the script must run early' });
      }
      return hits;
    },
  },
  {
    id: 'css-import-font',
    checks: [29, 33],
    confidence: 'medium',
    exts: STYLE,
    summary: 'CSS @import of a remote stylesheet (often fonts); adds a serial request chain before render.',
    run: (ctx) => perLine(ctx, /@import\s+(url\(\s*)?["']?https?:\/\//, { skipComments: false }),
  },
  {
    id: 'layout-transition',
    checks: [45],
    confidence: 'low',
    exts: [...STYLE, ...CODE],
    summary: 'Transition on "all" or a layout property; may trigger layout on every frame.',
    run(ctx) {
      const css = /\btransition(-property)?\s*:\s*[^;{}]*\b(all|width|height|top|left|right|bottom|margin(-\w+)?|padding(-\w+)?)\b/;
      const js = /\btransition(Property)?\s*:\s*["'`][^"'`]*\b(all|width|height|top|left|right|bottom|margin|padding)\b/;
      const re = STYLE.includes(ctx.ext) ? css : js;
      return perLine(ctx, re, { skipComments: !STYLE.includes(ctx.ext) });
    },
  },
  {
    id: 'prod-source-maps',
    checks: [44],
    confidence: 'medium',
    exts: ['.js', '.mjs', '.cjs', '.ts', '.mts'],
    summary: 'Production browser source maps enabled; confirm this is intentional and maps are not publicly served by accident.',
    run(ctx) {
      if (/(^|\/)next\.config\./.test(ctx.rel)) return perLine(ctx, /productionBrowserSourceMaps\s*:\s*true/);
      if (/(^|\/)vite\.config\./.test(ctx.rel)) {
        return perLine(ctx, /\bsourcemap\s*:\s*(true|["']inline["'])/).map((h) => ({ ...h, confidence: 'low' }));
      }
      return [];
    },
  },
  {
    id: 'opt-out-caching',
    checks: [20, 42],
    confidence: 'low',
    exts: CODE,
    summary: 'Explicit opt-out of caching or static rendering; confirm the data is truly per-request.',
    run: (ctx) =>
      perLine(ctx, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']|\bcache\s*:\s*["']no-store["']|export\s+const\s+revalidate\s*=\s*0\b/),
  },
];

const CONFIDENCE_ORDER = { medium: 0, low: 1 };

function redact(snippet) {
  return snippet
    .replace(/\bBearer\s+[^\s"'`]+/gi, 'Bearer ***')
    .replace(/(["'`])[A-Za-z0-9_\-+/=.]{24,}\1/g, '$1***$1')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '***')
    .replace(/\b(key|token|secret|password|passwd|authorization)\s*[:=]\s*\S+/gi, '$1=***')
    .slice(0, 160);
}

export function scan(rootArg = '.', { checks = null, maxFileBytes = 1_000_000, includeTests = false } = {}) {
  const root = resolve(rootArg);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const rules = checks ? RULES.filter((r) => r.checks.some((c) => checks.includes(c))) : RULES;
  const candidates = [];
  let filesScanned = 0;
  const skipped = { unsupportedType: 0, minified: 0, tests: 0, binaryOrUnreadable: 0 };
  const importSpecifiers = new Set();
  for (const file of walk(root, { maxFileBytes })) {
    const ext = extOf(file.rel);
    if (!ALL_EXT.has(ext)) {
      skipped.unsupportedType++;
      continue;
    }
    if (/\.min\.(js|css)$/.test(file.rel)) {
      skipped.minified++;
      continue;
    }
    if (!includeTests && TEST_PATH.test(file.rel)) {
      skipped.tests++;
      continue;
    }
    const auxiliary = AUX_PATH.test(file.rel);
    let text;
    try {
      text = readFileSync(file.path, 'utf8');
    } catch {
      skipped.binaryOrUnreadable++;
      continue;
    }
    if (text.includes('\u0000')) {
      skipped.binaryOrUnreadable++;
      continue;
    }
    filesScanned++;
    if (CODE.includes(ext)) {
      for (const m of text.matchAll(/(?:\bfrom|\bimport|\brequire\s*\(|\bimport\s*\()\s*["']([^"']+)["']/g)) importSpecifiers.add(m[1]);
    }
    const ctx = { rel: file.rel, ext, text, lines: text.split(/\r?\n/) };
    for (const rule of rules) {
      if (!rule.exts.includes(ext)) continue;
      for (const hit of rule.run(ctx)) {
        candidates.push({
          rule: rule.id,
          checks: rule.checks,
          confidence: auxiliary ? 'low' : hit.confidence || rule.confidence,
          file: file.rel,
          line: hit.line,
          snippet: redact((ctx.lines[hit.line - 1] || '').trim()),
          ...(hit.key ? { key: hit.key } : {}),
          ...(hit.note || auxiliary ? { note: [hit.note, auxiliary && 'auxiliary path (examples, docs, scripts, tools)'].filter(Boolean).join('; ') } : {}),
        });
      }
    }
  }
  annotateDuplicateFetches(candidates);
  annotateUnreachableImports(candidates, importSpecifiers);
  candidates.sort(
    (a, b) =>
      CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
      a.rule.localeCompare(b.rule) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
  return { root, filesScanned, skipped, rulesApplied: rules.map((r) => r.id), candidates };
}

const addNote = (c, note) => {
  c.note = c.note ? `${c.note}; ${note}` : note;
};

/** Cross-file pass: effects in different files that fetch the same literal URL (check 3 evidence). */
function annotateDuplicateFetches(candidates) {
  const byUrl = new Map();
  for (const c of candidates) {
    if (c.rule !== 'effect-fetch' || !c.key) continue;
    if (!byUrl.has(c.key)) byUrl.set(c.key, []);
    byUrl.get(c.key).push(c);
  }
  for (const [url, list] of byUrl) {
    if (list.length < 2) continue;
    for (const c of list) {
      const others = list.filter((o) => o !== c).map((o) => `${o.file}:${o.line}`);
      addNote(c, `same URL ${url} also fetched in an effect at ${others.join(', ')}`);
    }
  }
}

const ENTRY_FILE = /(^|\/)(app\/(.*\/)?(page|layout|template|route|loading|error|not-found|default)|pages\/.*|(src\/)?(main|index|entry[\w-]*|server|app))\.[cm]?[jt]sx?$/;

/** Cross-file pass: heavy imports in modules that nothing appears to import cannot reach a bundle. */
function annotateUnreachableImports(candidates, specifiers) {
  const normalized = [...specifiers].map((s) => s.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, ''));
  for (const c of candidates) {
    if (c.rule !== 'heavy-import' || ENTRY_FILE.test(c.file)) continue;
    const noExt = c.file.replace(/\.[^./]+$/, '');
    const base = noExt.endsWith('/index') ? noExt.split('/').slice(-2, -1)[0] : noExt.split('/').pop();
    const imported = normalized.some((s) => s === base || s.endsWith(`/${base}`));
    if (!imported) {
      c.confidence = 'low';
      addNote(c, 'no importer of this module found by name; it may be unreachable and not shipped');
    }
  }
}

function toMarkdown(result, maxPerRule) {
  const lines = [
    '# Performance candidates',
    '',
    `Root: \`${result.root}\` — ${result.filesScanned} files scanned, ${result.candidates.length} candidates.`,
    `Skipped: ${Object.entries(result.skipped).filter(([, n]) => n).map(([k, n]) => `${n} ${k.replace(/[A-Z]/g, (ch) => ' ' + ch.toLowerCase())}`).join(', ') || 'none'}${result.skipped.tests ? ' (use --include-tests to scan tests)' : ''}.`,
    '',
    '> Candidates are reading-list items from text heuristics, not findings. Open each location, follow callers and data flow, and discard false positives before reporting.',
    '',
  ];
  if (!result.candidates.length) {
    lines.push('No candidates matched. This does not show the application is fast; it only means these patterns were not found.');
    return lines.join('\n');
  }
  const byRule = new Map();
  for (const c of result.candidates) {
    if (!byRule.has(c.rule)) byRule.set(c.rule, []);
    byRule.get(c.rule).push(c);
  }
  lines.push('| Rule | Checks | Confidence | Count |', '|---|---|---|---|');
  for (const [id, list] of byRule) {
    const rule = RULES.find((r) => r.id === id);
    lines.push(`| \`${id}\` | ${rule.checks.join(', ')} | ${rule.confidence} | ${list.length} |`);
  }
  lines.push('');
  for (const [id, list] of byRule) {
    const rule = RULES.find((r) => r.id === id);
    lines.push(`## \`${id}\` — checks ${rule.checks.join(', ')}`, '', rule.summary, '');
    for (const c of list.slice(0, maxPerRule)) {
      lines.push(`- \`${c.file}:${c.line}\` (${c.confidence})${c.note ? ` — ${c.note}` : ''}`);
      if (c.snippet) lines.push(`  \`${c.snippet.replace(/`/g, "'")}\``);
    }
    if (list.length > maxPerRule) lines.push(`- …and ${list.length - maxPerRule} more (use --json or --max-per-rule).`);
    lines.push('');
  }
  return lines.join('\n');
}

if (isMainModule(import.meta.url)) {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log('Usage: node scan.mjs [app-root] [--json] [--checks 3,8] [--max-per-rule 25] [--include-tests] [--list-rules]');
    process.exit(0);
  }
  if (flags['list-rules']) {
    for (const r of RULES) console.log(`${r.id.padEnd(24)} checks ${r.checks.join(',').padEnd(9)} ${r.confidence.padEnd(7)} ${r.summary}`);
    process.exit(0);
  }
  const checks = typeof flags.checks === 'string' ? flags.checks.split(',').map(Number).filter(Number.isInteger) : null;
  const maxPerRule = Number(flags['max-per-rule']) || 25;
  try {
    const result = scan(positional[0] || '.', { checks, includeTests: Boolean(flags['include-tests']) });
    console.log(flags.json ? JSON.stringify(result, null, 2) : toMarkdown(result, maxPerRule));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
