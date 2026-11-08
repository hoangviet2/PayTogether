// Run: node --test shared/   (Node ≥ 23 strips TS types natively; no deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { largestRemainder, setShare, splitEqually, initialBills, initialTxs, searchTxs, summarize, billAmounts, mayGrid } from './trip.ts';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test('largestRemainder always sums to the total', () => {
  for (let n = 0; n < 500; n++) {
    const total = Math.floor(Math.random() * 1_000_000);
    const w = Array.from({ length: 1 + (n % 7) }, () => Math.floor(Math.random() * 10000));
    assert.equal(sum(largestRemainder(total, w)), total);
  }
  assert.deepEqual(largestRemainder(100, [1, 1, 1]), [34, 33, 33]); // remainder goes to stable order
});

test('design figures reconcile: Patio Azahar split', () => {
  assert.deepEqual(billAmounts(initialBills[1]), [28942, 37200, 28929, 28929]);
});

test('setShare keeps 10000 bp, respects locks, resets acceptances', () => {
  let b = { ...initialBills[0], locked: [false, true, false, false] };
  b = setShare(b, 3, 4000);
  assert.equal(sum(b.bps), 10000);
  assert.equal(b.bps[1], 2500);
  assert.equal(b.bps[3], 4000);
  assert.ok(b.accepted.every((a) => !a));
  assert.equal(setShare(b, 3, 99999).bps[3], 7500); // capped by the locked share
  assert.equal(sum(splitEqually(b).bps), 10000);
  assert.equal(setShare(initialBills[1], 0, 0), initialBills[1]); // frozen bill unchanged
});

test('search: "hotel > 100" hits the 8 hotel shares', () => {
  assert.equal(searchTxs(initialTxs, 'hotel > 100').length, 8);
  assert.equal(searchTxs(initialTxs, 'alex').length, 4);
  assert.equal(searchTxs(initialTxs, '< 20').length, 2);
});

test('summary matches the dashboard design', () => {
  const s = summarize(initialTxs);
  assert.equal(s.total, 216419);
  assert.equal(s.captured, 146041);
  assert.equal(s.logged, 12520);
  assert.equal(s.pending, 57858);
  assert.equal(s.prepaidTotal, 202000);
  assert.equal(s.prepaidCollected, 144142);
  assert.deepEqual(s.byMember, [53262, 60059, 54669, 48429]);
});

test('May 2027 starts on Saturday', () => {
  const g = mayGrid();
  assert.deepEqual(g[6], { day: 1, inMonth: true });
  assert.deepEqual(g[0], { day: 25, inMonth: false });
});
