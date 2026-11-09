// Run: npm test (from Backend/). Store rules from ai.md §2 and claudee.md invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from './store.ts';

function pricedTrip() {
  const t = s.createTrip('Test', 'USD', ['Ana', 'Ben', 'Cy']);
  s.proposeDestinations(t, ['Lisbon'], '2027-05-14', '2027-05-17');
  [0, 1, 2].forEach((m) => s.confirm(t, m));
  assert.deepEqual(s.draftTimeline(t, [{ destination: { name: 'Lisbon', country: 'PT' }, nights: 3, arrive_date: '2027-05-14', depart_date: '2027-05-17' }]), []);
  [0, 1, 2].forEach((m) => s.confirm(t, m));
  const poll = s.createPoll(t, {
    kind: 'stay', leg_id: t.legs[0].id, question: 'Where?',
    options: [
      { name: 'A', price: { amount_cents: 10001, currency: 'USD', unit: 'per_night' }, source: 'web_search', why: 'x' },
      { name: 'B', price: null, source: 'web_search', why: 'y' },
    ],
  });
  return { t, poll };
}

test('confirm needs every member; tie keeps the poll open; full vote closes it', () => {
  const { t, poll } = pricedTrip();
  assert.equal(t.phase, 'PLACES');
  assert.throws(() => s.confirm(t, 0), s.Rejected); // no stay picked yet
  s.vote(t, poll.id, poll.options[0].id, 0);
  s.vote(t, poll.id, poll.options[1].id, 1);
  assert.match(s.closePoll(t, poll.id), /poll_tied/);
  assert.equal(poll.status, 'open');
  assert.match(s.vote(t, poll.id, poll.options[0].id, 2)!, /poll_closed/);
  assert.equal(poll.winner, poll.options[0].id);
  assert.equal(s.confirm(t, 0), null);
  s.confirm(t, 1);
  assert.match(s.confirm(t, 2)!, /PRICING/);
});

test('split: members edit only their own ratio, acceptances reset, orders only at 100%', () => {
  const { t, poll } = pricedTrip();
  [0, 1, 2].forEach((m) => s.vote(t, poll.id, poll.options[0].id, m));
  [0, 1, 2].forEach((m) => s.confirm(t, m));
  assert.throws(() => s.buildPricePreview(t, poll.options[1].id, true), s.Rejected); // loser can't be priced
  const p = s.buildPricePreview(t, poll.options[0].id, true);
  assert.equal(p.total_cents, 30003);
  assert.deepEqual(p.shares.map((x) => x.ratio_bp), [3334, 3333, 3333]);

  s.accept(t, p.id, 0);
  assert.match(s.setRatio(t, p.id, 1, 4000), /over 100% by 6\.67%/);
  assert.deepEqual(p.shares.map((x) => x.ratio_bp), [3334, 4000, 3333]); // nobody else moved
  assert.ok(p.shares.every((x) => !x.accepted));
  assert.throws(() => s.accept(t, p.id, 0), /100%/);
  assert.throws(() => s.resetEqual(t, p.id, 1), /owner/);
  s.resetEqual(t, p.id, 0);
  assert.equal(s.accept(t, p.id, 0), false);
  assert.equal(s.accept(t, p.id, 1), false);
  assert.equal(s.accept(t, p.id, 2), true);

  const rows = s.ordersCreated(t, p, ['O1', 'O2', 'O3']);
  assert.equal(rows.reduce((a, r) => a + r.amount, 0), p.total_cents);
  assert.throws(() => s.setRatio(t, p.id, 0, 0), /locked/);

  s.paymentStatus('O1', 'captured');
  s.paymentStatus('O2', 'captured');
  assert.equal(s.paymentStatus('O1', 'failed')?.row, undefined); // a capture is never downgraded
  assert.equal(t.phase, 'PRICING');
  assert.match(s.paymentStatus('O3', 'captured')!.event!, /BOOKED/);
});

test('logged expense: rows sum to the total and are paid by the logger', () => {
  const { t } = pricedTrip();
  const rows = s.logExpense(t, 1, { date: '2027-05-15', time: '20:00', vendor: 'Taberna', type: 'Restaurant', total: 1000, bps: [3334, 3333, 3333] });
  assert.equal(rows.reduce((a, r) => a + r.amount, 0), 1000);
  assert.ok(rows.every((r) => r.paid_by === 1 && r.leg === 'Lisbon'));
  assert.throws(() => s.logExpense(t, 1, { date: '2027-05-15', time: '20:00', vendor: 'X', type: 'Y', total: 1, bps: [5000, 5000] }), s.Rejected);
});

test('join by code: owner is member 0, joining twice keeps one seat, closed once prices are split', () => {
  const t = s.createTrip('Join', 'USD', ['Owner'], 'pp-owner');
  assert.equal(s.memberOf(t, 'pp-owner'), 0);
  assert.match(t.code, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(s.byCode(` ${t.code.toLowerCase()} `), t);
  assert.equal(s.join(t, 'Friend', 'pp-friend'), 1);
  assert.equal(s.join(t, 'Friend', 'pp-friend'), 1);
  assert.equal(t.members.length, 2);
  t.phase = 'PRICING';
  assert.throws(() => s.join(t, 'Late', 'pp-late'), s.Rejected);
  assert.equal(s.publicState(t).code, undefined);
  assert.ok(s.publicState(t).members.every((m) => !('user' in m)));
});
