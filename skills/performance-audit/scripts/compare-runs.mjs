#!/usr/bin/env node
// Compare repeated baseline and candidate measurements honestly.
//
// Usage:
//   node compare-runs.mjs --baseline 812,790,845 --candidate 640,655,700 [--metric "LCP ms"]
//                         [--higher-is-better] [--alpha 0.05] [--min-change 2] [--min-runs 5] [--json]
//   node compare-runs.mjs --file runs.json      # {"metric": "...", "baseline": [...], "candidate": [...], "higherIsBetter": false}
//
// Verdicts: improved | regressed | no-detectable-change | inconclusive | insufficient-data
import { readFileSync } from 'node:fs';
import { parseArgs, isMainModule } from './lib/walk.mjs';

const sortNum = (xs) => [...xs].sort((a, b) => a - b);

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function describe(values) {
  const s = sortNum(values);
  const median = quantile(s, 0.5);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const mad = quantile(sortNum(s.map((v) => Math.abs(v - median))), 0.5);
  return { n: s.length, min: s[0], q1, median, q3, max: s[s.length - 1], mean, iqr: q3 - q1, mad };
}

function ranks(pooled) {
  // Average ranks for ties.
  const order = pooled.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(pooled.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function uStatistic(a, b) {
  const r = ranks([...a, ...b]);
  const ra = r.slice(0, a.length).reduce((x, y) => x + y, 0);
  return ra - (a.length * (a.length + 1)) / 2;
}

function* combinations(n, k, start = 0, acc = []) {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= n - (k - acc.length); i++) {
    acc.push(i);
    yield* combinations(n, k, i + 1, acc);
    acc.pop();
  }
}

function erf(x) {
  // Abramowitz and Stegun 7.1.26
  const sign = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Two-sided Mann-Whitney U test. Exact permutation p-value when n1+n2 <= 20, else normal approximation with tie correction. */
export function mannWhitney(a, b) {
  const n1 = a.length;
  const n2 = b.length;
  const u = uStatistic(a, b);
  const mu = (n1 * n2) / 2;
  if (n1 + n2 <= 20) {
    const pooled = [...a, ...b];
    const r = ranks(pooled);
    const observed = Math.abs(u - mu);
    let extreme = 0;
    let total = 0;
    for (const idx of combinations(n1 + n2, n1)) {
      const ra = idx.reduce((s, i) => s + r[i], 0);
      const uu = ra - (n1 * (n1 + 1)) / 2;
      if (Math.abs(uu - mu) >= observed - 1e-9) extreme++;
      total++;
    }
    return { u, p: extreme / total, method: 'exact' };
  }
  const pooled = [...a, ...b];
  const counts = new Map();
  for (const v of pooled) counts.set(v, (counts.get(v) || 0) + 1);
  const n = n1 + n2;
  const tieTerm = [...counts.values()].reduce((s, t) => s + (t ** 3 - t), 0);
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  if (sigma === 0) return { u, p: 1, method: 'normal' };
  const z = (Math.abs(u - mu) - 0.5) / sigma; // continuity correction
  return { u, p: Math.min(1, 2 * (1 - normalCdf(Math.max(0, z)))), method: 'normal' };
}

export function compare({ baseline, candidate, metric = 'value', higherIsBetter = false, alpha = 0.05, minChangePct = 2, minRuns = 5 }) {
  for (const [name, xs] of [['baseline', baseline], ['candidate', candidate]]) {
    if (!Array.isArray(xs) || !xs.length || xs.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error(`${name} must be a non-empty list of finite numbers`);
    }
  }
  const b = describe(baseline);
  const c = describe(candidate);
  const delta = c.median - b.median;
  const deltaPct = b.median !== 0 ? (delta / Math.abs(b.median)) * 100 : null;
  const better = higherIsBetter ? delta > 0 : delta < 0;
  const test = mannWhitney(baseline, candidate);
  const spreadPct = b.median !== 0 ? (Math.max(b.iqr, c.iqr) / Math.abs(b.median)) * 100 : null;

  const reasons = [];
  let verdict;
  if (b.n < minRuns || c.n < minRuns) {
    verdict = 'insufficient-data';
    reasons.push(`Need at least ${minRuns} runs per condition (have ${b.n} baseline, ${c.n} candidate).`);
  } else if (test.p >= alpha) {
    const smallSpread = spreadPct !== null && spreadPct < minChangePct;
    verdict = smallSpread && deltaPct !== null && Math.abs(deltaPct) < minChangePct ? 'no-detectable-change' : 'inconclusive';
    reasons.push(`Difference not statistically distinguishable (p=${test.p.toFixed(4)} >= ${alpha}).`);
    if (verdict === 'inconclusive') reasons.push('Collect more runs or reduce noise (same build, machine, cache state, background load).');
  } else if (deltaPct !== null && Math.abs(deltaPct) < minChangePct) {
    verdict = 'no-detectable-change';
    reasons.push(`Statistically distinguishable but below the ${minChangePct}% practical threshold.`);
  } else {
    verdict = better ? 'improved' : 'regressed';
    reasons.push(`p=${test.p.toFixed(4)} < ${alpha} and median change ${deltaPct === null ? 'n/a' : deltaPct.toFixed(1) + '%'} exceeds ${minChangePct}%.`);
  }
  if (spreadPct !== null && spreadPct > 15) reasons.push(`High spread (IQR up to ${spreadPct.toFixed(1)}% of baseline median); results are noisy.`);
  return { metric, higherIsBetter, baseline: b, candidate: c, delta, deltaPct, test, alpha, minChangePct, verdict, reasons };
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

function toText(r) {
  const row = (name, d) => `| ${name} | ${d.n} | ${fmt(d.median)} | ${fmt(d.q1)}–${fmt(d.q3)} | ${fmt(d.min)}–${fmt(d.max)} | ${fmt(d.mad)} |`;
  return [
    `# Comparison: ${r.metric} (${r.higherIsBetter ? 'higher' : 'lower'} is better)`,
    '',
    '| Condition | n | Median | IQR | Range | MAD |',
    '|---|---|---|---|---|---|',
    row('Baseline', r.baseline),
    row('Candidate', r.candidate),
    '',
    `Median change: ${fmt(r.delta)}${r.deltaPct === null ? '' : ` (${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct.toFixed(1)}%)`}`,
    `Mann-Whitney U=${fmt(r.test.u)}, two-sided p=${r.test.p.toFixed(4)} (${r.test.method})`,
    '',
    `**Verdict: ${r.verdict}**`,
    ...r.reasons.map((x) => `- ${x}`),
    '',
    '_Lab comparison under the recorded conditions only; not evidence of field (real-user) impact._',
  ].join('\n');
}

const parseList = (s) =>
  String(s)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);

if (isMainModule(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || (!flags.file && (!flags.baseline || !flags.candidate))) {
    console.log('Usage: node compare-runs.mjs --baseline 1,2,3 --candidate 4,5,6 [--metric name] [--higher-is-better] [--alpha 0.05] [--min-change 2] [--min-runs 5] [--json]\n       node compare-runs.mjs --file runs.json');
    process.exit(flags.help ? 0 : 2);
  }
  try {
    let input;
    if (flags.file) {
      const data = JSON.parse(readFileSync(flags.file, 'utf8'));
      input = { baseline: data.baseline, candidate: data.candidate, metric: data.metric, higherIsBetter: Boolean(data.higherIsBetter) };
    } else {
      input = { baseline: parseList(flags.baseline), candidate: parseList(flags.candidate) };
    }
    if (typeof flags.metric === 'string') input.metric = flags.metric;
    if (flags['higher-is-better']) input.higherIsBetter = true;
    if (flags.alpha) input.alpha = Number(flags.alpha);
    if (flags['min-change']) input.minChangePct = Number(flags['min-change']);
    if (flags['min-runs']) input.minRuns = Number(flags['min-runs']);
    const result = compare(input);
    console.log(flags.json ? JSON.stringify(result, null, 2) : toText(result));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
