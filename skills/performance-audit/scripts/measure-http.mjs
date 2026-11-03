#!/usr/bin/env node
// Repeated HTTP timing and header sampling for performance-audit.
//
// Usage:
//   node measure-http.mjs <url> [--runs 10] [--warmup 1] [--method GET|HEAD] [--header "Name: value"]
//                         [--timeout 30000] [--allow-remote] [--json]
//
// Safety: only GET and HEAD are allowed, requests run sequentially, and non-local hosts
// are refused unless --allow-remote is given (obtain the user's approval first).
// Never pass production credentials or session cookies.
import { parseArgs, isMainModule } from './lib/walk.mjs';
import { describe } from './compare-runs.mjs';

const REPORT_HEADERS = [
  'content-type', 'content-encoding', 'content-length', 'transfer-encoding', 'cache-control', 'etag', 'last-modified',
  'vary', 'age', 'x-cache', 'cf-cache-status', 'x-vercel-cache', 'x-nextjs-cache', 'server-timing', 'server',
];

export function isLocalHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
}

export async function measure(url, { runs = 10, warmup = 1, method = 'GET', headers = {}, timeout = 30000, allowRemote = false } = {}) {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only http and https URLs are supported.');
  if (!['GET', 'HEAD'].includes(method)) throw new Error('Only GET and HEAD are allowed; this tool must not trigger writes.');
  if (!isLocalHost(target.hostname) && !allowRemote) {
    throw new Error(`Refusing non-local host ${target.hostname}. Re-run with --allow-remote only after the user approves measuring it.`);
  }
  const requestHeaders = { 'accept-encoding': 'br, gzip', ...headers };
  const samples = [];
  let lastHeaders = null;
  let lastStatus = null;
  for (let i = 0; i < warmup + runs; i++) {
    const start = performance.now();
    const res = await fetch(target, { method, headers: requestHeaders, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    const headersAt = performance.now();
    const body = method === 'HEAD' ? new Uint8Array() : new Uint8Array(await res.arrayBuffer());
    const end = performance.now();
    if (i < warmup) continue;
    lastStatus = res.status;
    lastHeaders = Object.fromEntries(REPORT_HEADERS.filter((h) => res.headers.has(h)).map((h) => [h, res.headers.get(h)]));
    samples.push({ status: res.status, headersMs: headersAt - start, totalMs: end - start, decodedBytes: body.length });
  }
  const statuses = [...new Set(samples.map((s) => s.status))];
  const notes = [];
  if (statuses.length > 1) notes.push(`Status codes varied across runs (${statuses.join(', ')}); results may mix different responses.`);
  if (lastStatus >= 300 && lastStatus < 400) notes.push('Response is a redirect; redirects are not followed. Measure the final URL as well.');
  if (lastStatus >= 400) notes.push(`Response status ${lastStatus}; timings describe an error response.`);
  notes.push('Time to headers includes connection setup on the first measured run; later runs may reuse the connection.');
  return {
    url: target.href,
    method,
    runs,
    warmup,
    status: lastStatus,
    headers: lastHeaders,
    timeToHeaders: describe(samples.map((s) => s.headersMs)),
    total: describe(samples.map((s) => s.totalMs)),
    decodedBytes: describe(samples.map((s) => s.decodedBytes)),
    samples,
    notes,
  };
}

const ms = (v) => `${v.toFixed(1)} ms`;
const list = (xs) => xs.map((v) => Math.round(v)).join(',');

function toText(r) {
  const row = (name, d, f) => `| ${name} | ${f(d.median)} | ${f(d.q1)}–${f(d.q3)} | ${f(d.min)}–${f(d.max)} |`;
  const lines = [
    `# HTTP measurement: ${r.method} ${r.url}`,
    '',
    `Status ${r.status}; ${r.runs} measured runs after ${r.warmup} warm-up.`,
    '',
    '| Metric | Median | IQR | Range |',
    '|---|---|---|---|',
    row('Time to headers', r.timeToHeaders, ms),
    row('Total time', r.total, ms),
    row('Decoded body bytes', r.decodedBytes, (v) => String(Math.round(v))),
    '',
    '## Response headers (last run)',
    '',
  ];
  for (const [k, v] of Object.entries(r.headers || {})) lines.push(`- \`${k}: ${v}\``);
  if (!r.headers?.['content-encoding'] && r.method === 'GET') lines.push('- No `content-encoding` header: the response was not compressed for `Accept-Encoding: br, gzip` (check 9 if this is text).');
  lines.push(
    '',
    'Raw values for compare-runs.mjs:',
    '',
    '```text',
    `time-to-headers ms: ${list(r.samples.map((s) => s.headersMs))}`,
    `total ms:           ${list(r.samples.map((s) => s.totalMs))}`,
    '```',
    '',
    ...r.notes.map((n) => `_${n}_`),
  );
  return lines.join('\n');
}

if (isMainModule(import.meta.url)) {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || !positional[0]) {
    console.log('Usage: node measure-http.mjs <url> [--runs 10] [--warmup 1] [--method GET|HEAD] [--header "Name: value"] [--timeout 30000] [--allow-remote] [--json]');
    process.exit(flags.help ? 0 : 2);
  }
  const headers = {};
  if (typeof flags.header === 'string') {
    const [name, ...rest] = flags.header.split(':');
    headers[name.trim().toLowerCase()] = rest.join(':').trim();
  }
  try {
    const result = await measure(positional[0], {
      runs: Number(flags.runs) || 10,
      warmup: flags.warmup !== undefined ? Number(flags.warmup) : 1,
      method: String(flags.method || 'GET').toUpperCase(),
      headers,
      timeout: Number(flags.timeout) || 30000,
      allowRemote: Boolean(flags['allow-remote']),
    });
    console.log(flags.json ? JSON.stringify(result, null, 2) : toText(result));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
