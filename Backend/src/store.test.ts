// Run: npm test (from Backend/). Store rules from ai.md §2 and claudee.md invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from './store.ts';

function pricedTrip() {
  const t = s.createTrip('Test', 'USD', ['Ana', 'Ben', 'Cy']); // three members already, so the group rule passes
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

test('split: setting a share moves the others to keep 100%, acceptances reset', () => {
  const { t, poll } = pricedTrip();
  [0, 1, 2].forEach((m) => s.vote(t, poll.id, poll.options[0].id, m));
  [0, 1, 2].forEach((m) => s.confirm(t, m));
  assert.throws(() => s.buildPricePreview(t, poll.options[1].id, true), s.Rejected); // loser can't be priced
  const p = s.buildPricePreview(t, poll.options[0].id, true);
  assert.equal(p.total_cents, 30003);
  assert.deepEqual(p.shares.map((x) => x.ratio_bp), [3334, 3333, 3333]);

  s.accept(t, p.id, 0);
  assert.match(s.setRatio(t, p.id, 1, 4000), /Ana 30\.00%, Cy 30\.00%/);
  assert.deepEqual(p.shares.map((x) => x.ratio_bp), [3000, 4000, 3000]); // the rest spread in proportion
  assert.ok(p.shares.every((x) => !x.accepted));
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

test('solo trip refuses joins; dates must run forward', () => {
  const t = s.createTrip('Me', 'USD', ['Ana'], 'pp-ana', { solo: true, window: { start: '2027-05-14', end: '2027-05-17' } });
  assert.equal(s.join(t, 'Ana', 'pp-ana'), 0); // the owner re-joining is still fine
  assert.throws(() => s.join(t, 'Ben', 'pp-ben'), s.Rejected);
  assert.throws(() => s.createTrip('Bad', 'USD', ['Ana'], 'pp-ana', { window: { start: '2027-05-17', end: '2027-05-14' } }), s.Rejected);
});

test('group trip: confirm waits for a second member; invite by email, accept joins', () => {
  const t = s.createTrip('G', 'USD', ['Ana'], 'pp-ana');
  s.proposeDestinations(t, ['Lisbon'], '2027-05-14', '2027-05-17');
  assert.throws(() => s.confirm(t, 0), /at least one more person/);
  assert.throws(() => s.invite(t, 'nobody@x.com'), /No PayTogether account/);
  s.remember('pp-ben', 'Ben', 'ben@x.com');
  assert.equal(s.invite(t, ' BEN@x.com '), 'Ben');
  s.invite(t, 'ben@x.com'); // inviting twice keeps one invite
  assert.equal(t.invites!.length, 1);
  assert.deepEqual(s.invitesFor('pp-ben').map((x) => x.id), [t.id]);
  s.join(t, 'Ben', 'pp-ben');
  assert.equal(t.invites!.length, 0);
  assert.throws(() => s.invite(t, 'ben@x.com'), /already in this trip/);
  assert.equal(s.confirm(t, 0), null); // 2 members now: confirm counts, waits for Ben
  const solo = s.createTrip('S', 'USD', ['Ana'], 'pp-ana', { solo: true });
  assert.throws(() => s.invite(solo, 'ben@x.com'), /solo trip/);
});

test('plan edits: +1 night rebalances, dates refit, stops keep ids, locked from Pricing', () => {
  const t = s.createTrip('VN', 'USD', ['Ana'], 'pp-ana', { solo: true });
  s.proposeDestinations(t, ['HCM', 'Hanoi', 'Da Nang'], '2027-05-01', '2027-05-11');
  s.confirm(t, 0);
  const leg = (name: string, nights: number, arrive: string, depart: string) => ({ destination: { name, country: 'VN' }, nights, arrive_date: arrive, depart_date: depart });
  assert.deepEqual(s.draftTimeline(t, [leg('HCM', 3, '2027-05-01', '2027-05-04'), leg('Hanoi', 5, '2027-05-04', '2027-05-09'), leg('Da Nang', 2, '2027-05-09', '2027-05-11')]), []);
  const nights = () => t.legs.map((l) => l.nights);
  assert.match(s.setNights(t, t.legs[0].id, 4), /adjusted Hanoi 5→4/);
  assert.deepEqual(nights(), [4, 4, 2]);
  assert.equal(t.legs[2].depart_date, '2027-05-11'); // trip length unchanged
  s.updateTrip(t, { end_date: '2027-05-13' }); // +2 nights go to the stops with the fewest
  assert.deepEqual(nights(), [4, 4, 4]);
  const hanoi = t.legs[1].id;
  s.setStops(t, [{ name: 'Hanoi', country: 'VN' }, { name: 'Hue', country: 'VN' }]);
  assert.equal(t.legs[0].id, hanoi);
  assert.equal(t.legs.reduce((a, l) => a + l.nights, 0), 12);
  assert.equal(t.legs.at(-1)!.depart_date, t.window!.end);
  t.phase = 'PRICING';
  assert.throws(() => s.updateTrip(t, { name: 'X' }), /locked/);
});

test('pricing: entering Pricing prices every stop; booking waits for every stay', () => {
  const t = s.createTrip('3 hotels', 'USD', ['Ana', 'Ben'], 'pp-ana');
  s.proposeDestinations(t, ['A', 'B', 'C'], '2027-05-01', '2027-05-07');
  [0, 1].forEach((m) => s.confirm(t, m));
  const leg = (name: string, a: string, d: string) => ({ destination: { name, country: 'X' }, nights: 2, arrive_date: a, depart_date: d });
  s.draftTimeline(t, [leg('A', '2027-05-01', '2027-05-03'), leg('B', '2027-05-03', '2027-05-05'), leg('C', '2027-05-05', '2027-05-07')]);
  [0, 1].forEach((m) => s.confirm(t, m));
  for (const l of t.legs) {
    const poll = s.createPoll(t, { kind: 'stay', leg_id: l.id, question: l.destination.name, options: [
      { name: `${l.destination.name} Inn`, price: { amount_cents: 10000, currency: 'USD', unit: 'per_night' }, source: 'web_search', why: 'x' },
      { name: 'Other', price: null, source: 'web_search', why: 'y' }] });
    [0, 1].forEach((m) => s.vote(t, poll.id, poll.options[0].id, m));
  }
  s.confirm(t, 0);
  assert.match(s.confirm(t, 1)!, /Every stop's winning stay now has a price preview/);
  assert.equal(t.previews.filter((p) => p.kind === 'stay').length, 3); // all three hotels, not two
  assert.deepEqual(t.previews.map((p) => p.total_cents), [20000, 20000, 20000]);
});

test('split and store bills: the other covers the rest; 0% members get no row', () => {
  const t = s.createTrip('Dinner', 'USD', ['Ana', 'Ben', 'Cy']);
  const p = s.createStoreBill(t, 0, { vendor: 'Pho 24', email: 'Pho@Store.com', total: 9000, category: 'Restaurant', members: [0, 1] });
  assert.deepEqual(p.shares.map((x) => x.ratio_bp), [5000, 5000, 0]);
  assert.equal(p.shares[2].accepted, true); // not on the bill
  s.setRatio(t, p.id, 0, 3000);
  assert.deepEqual(p.shares.map((x) => x.ratio_bp), [3000, 7000, 0]);
  assert.equal(s.accept(t, p.id, 0), false);
  assert.equal(s.accept(t, p.id, 1), true); // everyone on it accepted → orders go out
  const rows = s.ordersCreated(t, p, ['o1', 'o2', '']);
  assert.deepEqual(rows.map((r) => [r.member, r.amount, r.source]), [[0, 2700, 'In-store'], [1, 6300, 'In-store']]);
  assert.equal(p.payee!.email, 'pho@store.com');
});

test('delete trip: owner only, never once PayPal requests exist', () => {
  const t = s.createTrip('Del', 'USD', ['Ana', 'Ben']);
  assert.throws(() => s.deleteTrip(t, 1), /created the trip/);
  const p = s.createStoreBill(t, 0, { vendor: 'Cafe', email: 'c@x.com', total: 1000, category: 'Restaurant', members: [0, 1] });
  p.shares[0].order_id = 'O1';
  assert.throws(() => s.deleteTrip(t, 0), /PayPal payment requests/);
  p.shares[0].order_id = undefined;
  s.deleteTrip(t, 0);
  assert.equal(s.trips.has(t.id), false);
});

test('leave: their messages, votes and confirmations go; positions shift; refused for the owner or once there are bills', () => {
  const t = s.createTrip('Leave', 'USD', ['Ana', 'Ben', 'Cy'], 'pp-ana');
  s.say(t, 1, 'hi from Ben');
  s.say(t, 2, 'hi from Cy');
  t.confirms = [0, 1, 2];
  const poll = s.createPoll(t, { kind: 'custom', question: 'Q', options: [{ name: 'A', price: null, source: 'web_search', why: 'x' }, { name: 'B', price: null, source: 'web_search', why: 'y' }] });
  s.addOption(t, poll.id, 1, 'Bens pick');
  poll.options[0].voters = [1, 2];
  assert.throws(() => s.leave(t, 0), /Delete it instead/);
  s.leave(t, 1);
  assert.deepEqual(t.members.map((x) => x.name), ['Ana', 'Cy']);
  assert.deepEqual(t.confirms, [0, 1]);
  assert.equal(t.chat.some((c) => c.text === 'hi from Ben'), false); // gone from the disk
  assert.equal(t.chat.find((c) => c.text === 'hi from Cy')!.from, 1);
  assert.deepEqual(poll.options[0].voters, [1]);
  assert.deepEqual([poll.options[2].added_by, poll.options[2].why], ['ai', 'Added by a member who left']);
  assert.equal(JSON.stringify(t).includes('pp-ben'), false);
  s.createPurchase(t, 1, { title: 'Adapter', url: 'https://shop.example/a', cents: 1999 });
  assert.throws(() => s.leave(t, 1), /bills/);
  const p = t.previews[0];
  assert.deepEqual([p.kind, p.shares.map((x) => x.ratio_bp)], ['shop', [0, 10000]]);
  assert.equal(s.ordersCreated(t, p, ['', 'O9'])[0].source, 'Online purchase');
});
