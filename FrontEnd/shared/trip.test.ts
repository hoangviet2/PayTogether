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

test('wayfinderReply: silent unless mentioned, refuses money moves, amounts come from data', async () => {
  const { wayfinderReply, eur } = await import('./trip.ts');
  assert.equal(wayfinderReply('lol nice', initialTxs, null), null);
  assert.match(wayfinderReply('@Wayfinder pay Maya for me', initialTxs, null)!, /can't move money/);
  assert.match(wayfinderReply('@Wayfinder change Sam split to 10%', initialTxs, null)!, /Only you can change your own bar/);
  assert.ok(wayfinderReply('@Wayfinder how much has everyone spent?', initialTxs, null)!.includes(eur(summarize(initialTxs).total)));
  assert.match(wayfinderReply('@wayfinder poll status?', initialTxs, null)!, /3 of 4 have voted/);
  assert.match(wayfinderReply('@wayfinder poll status?', initialTxs, 'c')!, /4 of 4 have voted/);
});

test('live model: timeline validation, redate, split amounts, settlement', async () => {
  const m = await import('./trip.ts');
  const leg = (name: string, arrive: string, nights: number) => ({ id: name, destination: { name, country: 'X' }, nights, arrive_date: arrive, depart_date: m.addDays(arrive, nights) });
  const legs = [leg('Lisbon', '2027-05-14', 3), leg('Porto', '2027-05-17', 2)];
  assert.deepEqual(m.validateTimeline(legs, { start: '2027-05-14', end: '2027-05-19' }), []);
  assert.equal(m.validateTimeline(legs, { start: '2027-05-14', end: '2027-05-20' }).length, 1);
  const moved = m.redate([{ ...legs[0], nights: 4 }, legs[1]]);
  assert.equal(moved[1].arrive_date, '2027-05-18');
  assert.deepEqual(m.validateTimeline(moved, null), []);
  assert.equal(m.addDays('2027-12-31', 1), '2028-01-01');

  const p = { id: 'p', option_id: 'o', kind: 'stay' as const, title: 't', meta: '', total_cents: 100001, currency: 'USD', prepaid: true, frozen: false, is_estimate: true as const,
    shares: m.equalBps(3).map((ratio_bp: number, member: number) => ({ member, ratio_bp, accepted: false, status: 'none' as const })) };
  assert.equal(sum(m.shareAmounts(p)!), 100001);
  assert.equal(m.shareAmounts({ ...p, shares: p.shares.map((s, i) => (i ? s : { ...s, ratio_bp: 5000 })) }), null); // off 100% → no amounts

  const bal = [3000, -1000, -2000, 0];
  const tx = m.settle(bal);
  assert.equal(tx.length, 2);
  const after = bal.slice();
  tx.forEach((t: { from: number; to: number; amount: number }) => { after[t.from] += t.amount; after[t.to] -= t.amount; });
  assert.deepEqual(after, [0, 0, 0, 0]);
});

test('mySummary: only my rows, pending vs spent, todos for unaccepted and unpaid shares', async () => {
  const m = await import('./trip.ts');
  const row = (member: number, amount: number, status: string, date = '2027-05-14') => ({ id: `${member}${status}${amount}`, member, paid_by: member, date, time: '10:00', vendor: 'V', type: 'Hotel', leg: 'L', amount, total: amount, shareBp: 5000, source: 'Logged', status });
  const share = (member: number, accepted: boolean, status = 'none') => ({ member, ratio_bp: 5000, accepted, status });
  const t = {
    txs: [row(0, 1000, 'captured'), row(0, 500, 'logged', '2027-05-15'), row(0, 300, 'created'), row(0, 99, 'failed'), row(1, 7000, 'captured')],
    previews: [
      { id: 'a', title: 'Open', total_cents: 2000, frozen: false, shares: [share(0, false), share(1, true)] },
      { id: 'b', title: 'Unpaid', total_cents: 2000, frozen: true, shares: [share(0, true, 'created'), share(1, true, 'created')] },
      { id: 'c', title: 'Paid', total_cents: 2000, frozen: true, shares: [share(0, true, 'captured'), share(1, true, 'captured')] },
    ],
  } as never;
  const s = m.mySummary(t, 0);
  assert.equal(s.spent, 1500);
  assert.equal(s.pending, 300);
  assert.deepEqual(s.byType, [{ type: 'Hotel', amount: 1800 }]);
  assert.equal(s.recent[0].date, '2027-05-15');
  assert.deepEqual(s.todos.map((x: { cta: string; cents: number | null }) => [x.cta, x.cents]), [['Open split', 1000], ['Pay my share', 1000]]);
  assert.equal(m.mySummary(t, 2).spent, 0); // a seat with nothing is all zero
});

test('nights: +1 in one stop comes from the stop with the most nights; total stays fixed', async () => {
  const m = await import('./trip.ts');
  // HCM 3, Hanoi 5, Da Nang 2: HCM +1 takes from Hanoi
  assert.deepEqual(m.rebalanceNights([3, 5, 2], 0, 4), [4, 4, 2]);
  assert.deepEqual(m.rebalanceNights([3, 5, 2], 0, 5), [5, 3, 2]);
  assert.deepEqual(m.rebalanceNights([4, 4, 2], 2, 3), [4, 3, 3]); // tie: the later stop gives
  assert.deepEqual(m.rebalanceNights([3, 5, 2], 1, 4), [3, 4, 3]); // -1 goes to the stop with the fewest
  assert.equal(m.rebalanceNights([1, 1, 8], 2, 9), null); // others already at 1
  assert.equal(m.rebalanceNights([3, 5, 2], 0, 0), null);
  assert.deepEqual(m.fitNights([3, 5, 2], 12), [4, 5, 3]); // longer trip: fewest first
  assert.deepEqual(m.fitNights([3, 5, 2], 8), [3, 3, 2]);
  assert.equal(m.fitNights([3, 5, 2], 2), null);
});
