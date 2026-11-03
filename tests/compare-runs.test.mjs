import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, mannWhitney, describe } from '../skills/performance-audit/scripts/compare-runs.mjs';

test('describe computes median and quartiles', () => {
  const d = describe([5, 1, 3, 2, 4]);
  assert.equal(d.median, 3);
  assert.equal(d.q1, 2);
  assert.equal(d.q3, 4);
  assert.equal(d.mad, 1);
});

test('exact Mann-Whitney p for fully separated 5 vs 5 samples is 2/252', () => {
  const r = mannWhitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
  assert.equal(r.method, 'exact');
  assert.equal(r.u, 0);
  assert.ok(Math.abs(r.p - 2 / 252) < 1e-12);
});

test('identical samples give p = 1', () => {
  assert.equal(mannWhitney([3, 3, 3, 3, 3], [3, 3, 3, 3, 3]).p, 1);
});

test('lower-is-better improvement is reported', () => {
  const r = compare({ baseline: [812, 790, 845, 801, 830], candidate: [640, 655, 700, 630, 662] });
  assert.equal(r.verdict, 'improved');
});

test('regression is reported', () => {
  const r = compare({ baseline: [640, 655, 700, 630, 662], candidate: [812, 790, 845, 801, 830] });
  assert.equal(r.verdict, 'regressed');
});

test('higher-is-better flips direction', () => {
  const r = compare({ baseline: [10, 11, 12, 13, 14], candidate: [20, 21, 22, 23, 24], higherIsBetter: true });
  assert.equal(r.verdict, 'improved');
});

test('too few runs are insufficient even when separated', () => {
  assert.equal(compare({ baseline: [800, 810, 820], candidate: [600, 610, 620] }).verdict, 'insufficient-data');
});

test('overlapping noisy samples are inconclusive', () => {
  const r = compare({ baseline: [100, 120, 90, 110, 105, 98], candidate: [101, 118, 95, 108, 99, 103] });
  assert.equal(r.verdict, 'inconclusive');
});

test('large samples use the normal approximation', () => {
  const a = Array.from({ length: 15 }, (_, i) => 100 + i);
  const b = Array.from({ length: 15 }, (_, i) => 200 + i);
  const r = compare({ baseline: a, candidate: b });
  assert.equal(r.test.method, 'normal');
  assert.equal(r.verdict, 'regressed');
});

test('rejects non-numeric input', () => {
  assert.throws(() => compare({ baseline: [1, NaN], candidate: [1, 2] }));
});
