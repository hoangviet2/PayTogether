// Trip state and every rule-bearing mutation. Pure-ish: no network; callers run side effects (PayPal, Elastic, Wayfinder).
// shortcut: one JSON file instead of Postgres + Prisma; move to the claudee.md stack before more than one server runs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import {
  PALETTE, PHASES, confirmBlocker, daysBetween, equalBps, fitNights, pollTally, rebalanceNights, rebalanceShares, redate, shareAmounts, validateTimeline,
  type Leg, type PlaceOption, type Poll, type Preview, type Trip, type Txn,
} from '../../FrontEnd/shared/trip.ts';

const FILE = process.env.DATA_FILE ?? new URL('../data.json', import.meta.url).pathname;
export const trips = new Map<string, Trip>(existsSync(FILE) ? Object.entries(JSON.parse(readFileSync(FILE, 'utf8'))) : []);
// Code alphabet without look-alikes (0/O, 1/I/L) so it can be read out loud.
const newCode = (): string => {
  const c = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[randomInt(31)]).join('');
  return [...trips.values()].some((t) => t.code === c) ? newCode() : c;
};
for (const t of trips.values()) {
  t.code ??= newCode(); // trips saved before join codes existed
  t.busy = false; // a Wayfinder turn cut off by a restart must not leave the chat stuck on "thinking"
}
// Everyone who has logged in, so a trip owner can invite an account by its PayPal email. Kept beside the trips file.
const USERS_FILE = FILE.replace(/(\.json)?$/, '.users.json');
export const users = new Map<string, { name: string; email: string | null }>(existsSync(USERS_FILE) ? Object.entries(JSON.parse(readFileSync(USERS_FILE, 'utf8'))) : []);
export const save = () => {
  if (process.env.DATA_FILE === ':memory:') return;
  writeFileSync(FILE, JSON.stringify(Object.fromEntries(trips)));
  writeFileSync(USERS_FILE, JSON.stringify(Object.fromEntries(users)));
};
export const remember = (user: string, name: string, email: string | null) => users.set(user, { name, email });
const id = () => randomUUID().slice(0, 8);
const now = () => new Date().toISOString();
export class Rejected extends Error {}
const reject = (msg: string): never => { throw new Rejected(msg); };

export const OPENING =
  "Hi everyone 👋 I'm Wayfinder. Where do you want to go? Drop cities, regions, or even a vibe (\"somewhere warm with good food\"), plus rough dates and budget if you have them.";

/** `user` is the creator's PayPal id; they become member 0. A solo trip never takes another member. */
export function createTrip(name: string, currency: string, names: string[], user?: string, opts: { solo?: boolean; window?: Trip['window'] } = {}): Trip {
  if (opts.window && !(opts.window.end > opts.window.start)) reject('End date must be after the start date.');
  const t: Trip = {
    id: id(), name, currency, phase: 'DESTINATIONS', code: newCode(), ...(opts.solo && { solo: true }),
    members: names.map((n, i) => ({ name: n, ...PALETTE[i], ...(i === 0 && user && { user }) })),
    window: opts.window ?? null, destinations: [], legs: [], polls: [], previews: [], txs: [], confirms: [], busy: false,
    chat: [{ from: 'ai', at: now(), text: OPENING }],
  };
  trips.set(t.id, t);
  save();
  return t;
}

export const byCode = (code: string) => [...trips.values()].find((t) => t.code === code.trim().toUpperCase());
export const memberOf = (t: Trip, user: string) => t.members.findIndex((m) => m.user === user);

/** Adds a logged-in user as a member; joining twice returns the same seat. Closed once prices are split per member. */
export function join(t: Trip, name: string, user: string): number {
  const seat = memberOf(t, user);
  if (seat >= 0) return seat;
  if (t.solo) reject('This is a solo trip, so nobody else can join it.');
  if (PHASES.indexOf(t.phase) >= PHASES.indexOf('PRICING')) reject('This trip is already splitting prices, so new members can no longer join.');
  if (t.members.length >= PALETTE.length) reject(`A trip can have at most ${PALETTE.length} members.`);
  t.members.push({ name, ...PALETTE[t.members.length], user });
  t.invites = t.invites?.filter((i) => i.user !== user);
  say(t, 'ai', `${name} joined the trip 👋`);
  return t.members.length - 1;
}

/** Invites a PayTogether account by PayPal email; they join by accepting on their home page. */
export function invite(t: Trip, email: string) {
  if (t.solo) reject('This is a solo trip, so nobody else can join it.');
  if (PHASES.indexOf(t.phase) >= PHASES.indexOf('PRICING')) reject('This trip is already splitting prices, so new members can no longer join.');
  const e = email.trim().toLowerCase();
  const found = [...users].find(([, u]) => u.email === e);
  if (!found) reject('No PayTogether account uses that email yet. Ask them to log in with PayPal once, or send them the join code.');
  const [user, { name }] = found!;
  if (memberOf(t, user) >= 0) reject(`${name} is already in this trip.`);
  if (!t.invites?.some((i) => i.user === user)) (t.invites ??= []).push({ user, name });
  return name;
}
export const invitesFor = (user: string) => [...trips.values()].filter((t) => t.invites?.some((i) => i.user === user));

/** Owner only. Refused once any PayPal payment request exists, so no payment loses its trip. */
export function deleteTrip(t: Trip, m: number) {
  if (m !== 0) reject('Only the person who created the trip can delete it.');
  if (t.previews.some((p) => p.shares.some((s) => s.order_id))) reject('This trip has PayPal payment requests, so it can’t be deleted.');
  trips.delete(t.id);
}

export const say = (t: Trip, from: number | 'ai', text: string) => t.chat.push({ from, at: now(), text });

// ---------- confirm / phases (ai.md §2: any member proposes, all members must accept) ----------
export function confirm(t: Trip, m: number): string | null {
  const blocker = confirmBlocker(t);
  if (blocker) reject(blocker);
  if (!t.confirms.includes(m)) t.confirms.push(m);
  if (t.confirms.length < t.members.length) return null;
  return advance(t);
}
function advance(t: Trip): string {
  t.phase = PHASES[PHASES.indexOf(t.phase) + 1];
  t.confirms = [];
  return `phase_changed: the group confirmed, phase is now ${t.phase}.${t.phase === 'PRICING' ? priceStays(t) : ''}`;
}

/** Entering Pricing: a prepaid price preview for every stop's winning stay, so no stay is left out of the bill. */
function priceStays(t: Trip): string {
  const missing: string[] = [];
  for (const l of t.legs) {
    const poll = t.polls.find((p) => p.kind === 'stay' && p.leg_id === l.id && p.status === 'closed' && p.winner);
    if (!poll || t.previews.some((p) => p.option_id === poll.winner)) continue;
    try { buildPricePreview(t, poll.winner!, true); } catch (e) { missing.push(`${l.destination.name}: ${(e as Error).message}`); }
  }
  return missing.length
    ? ` Priced the other stays automatically. Could not price ${missing.join('; ')}. Find each price with web_search, call enrich_option, then build_price_preview.`
    : ' Every stop\'s winning stay now has a price preview.';
}

// ---------- Wayfinder tool writes ----------
export function proposeDestinations(t: Trip, destinations: string[], start: string, end: string, budget?: number) {
  if (t.phase !== 'DESTINATIONS') reject('Destinations are already confirmed.');
  if (!(end > start)) reject('end_date must be after start_date.');
  Object.assign(t, { destinations, window: { start, end }, budget_per_person_cents: budget, confirms: [] });
}

export function draftTimeline(t: Trip, legs: Omit<Leg, 'id'>[]): string[] {
  const withIds = legs.map((l) => ({ ...l, id: id() }));
  const errs = validateTimeline(withIds, t.window);
  if (!errs.length) Object.assign(t, { legs: withIds, confirms: [] });
  return errs;
}

export function createPoll(t: Trip, p: { kind: Poll['kind']; leg_id?: string; question: string; options: Omit<PlaceOption, 'id' | 'voters' | 'added_by'>[] }) {
  if (p.leg_id && !t.legs.some((l) => l.id === p.leg_id)) reject(`Unknown leg_id ${p.leg_id}.`);
  const poll: Poll = { id: id(), kind: p.kind, leg_id: p.leg_id, question: p.question, status: 'open', options: p.options.map((o) => ({ ...o, id: id(), voters: [], added_by: 'ai' })) };
  t.polls.push(poll);
  return poll;
}

export function enrichOption(t: Trip, optionId: string, patch: Pick<PlaceOption, 'price' | 'why' | 'source_url' | 'address' | 'rating'>) {
  const o = t.polls.flatMap((p) => p.options).find((x) => x.id === optionId) ?? reject(`Unknown option ${optionId}.`);
  Object.assign(o, patch);
}

/** Default equal split: 100% / N, remainder basis points to the earliest members (stable order). */
export function buildPricePreview(t: Trip, optionId: string, prepaid: boolean): Preview {
  const poll = t.polls.find((p) => p.options.some((o) => o.id === optionId)) ?? reject(`Unknown option ${optionId}.`);
  if (poll.winner !== optionId) reject('Only a winning option can be priced.');
  const o = poll.options.find((x) => x.id === optionId)!;
  if (!o.price) reject(`${o.name} has no price from a search result yet; enrich it first.`);
  if (o.price!.currency !== t.currency) reject(`Price is in ${o.price!.currency} but the trip uses ${t.currency}.`);
  const leg = t.legs.find((l) => l.id === poll.leg_id);
  const n = t.members.length;
  const total = o.price!.unit === 'per_night' ? o.price!.amount_cents * (leg?.nights ?? 1) : o.price!.unit === 'per_person' ? o.price!.amount_cents * n : o.price!.amount_cents;
  const existing = t.previews.find((p) => p.option_id === optionId);
  if (existing?.frozen) reject('That preview is already collecting payment.');
  const p: Preview = {
    id: existing?.id ?? id(), option_id: optionId, leg_id: poll.leg_id, kind: poll.kind === 'dining' ? 'dining' : 'stay',
    title: o.name, meta: leg ? `${leg.destination.name} · ${leg.nights} night${leg.nights > 1 ? 's' : ''} · ${leg.arrive_date} → ${leg.depart_date}` : '',
    total_cents: total, currency: t.currency, prepaid, frozen: false, is_estimate: true,
    shares: equalBps(n).map((ratio_bp, member) => ({ member, ratio_bp, accepted: false, status: 'none' })),
  };
  t.previews = existing ? t.previews.map((x) => (x.id === p.id ? p : x)) : [...t.previews, p];
  return p;
}

// ---------- member actions ----------
export function vote(t: Trip, pollId: string, optionId: string | null, m: number): string | null {
  const p = openPoll(t, pollId);
  p.options.forEach((o) => (o.voters = o.voters.filter((v) => v !== m)));
  if (optionId) (p.options.find((o) => o.id === optionId) ?? reject('Unknown option.')).voters.push(m);
  return pollTally(p).voted === t.members.length ? closePoll(t, pollId) : null;
}

/** Closes on a single leader. On a tie the poll stays open and Wayfinder asks; it never breaks ties (ai.md §2.3). */
export function closePoll(t: Trip, pollId: string): string {
  const p = openPoll(t, pollId);
  const { leaders, votes } = pollTally(p);
  const score = p.options.map((o, k) => `${o.name} ${votes[k]}`).join(', ');
  if (leaders.length !== 1) return `poll_tied: "${p.question}" is tied or has no votes (${score}). Ask the group how to break it.`;
  p.status = 'closed';
  p.winner = leaders[0];
  return `poll_closed: "${p.question}" won by ${p.options.find((o) => o.id === p.winner)!.name} (${score}).`;
}

export function addOption(t: Trip, pollId: string, m: number, name: string): string {
  const p = openPoll(t, pollId);
  const o: PlaceOption = { id: id(), name, price: null, source: 'member_added', why: `Added by ${t.members[m].name}`, added_by: m, voters: [] };
  p.options.push(o);
  return `option_added: ${t.members[m].name} added "${name}" (option_id ${o.id}) to poll "${p.question}". Look it up and call enrich_option.`;
}

function openPoll(t: Trip, pollId: string) {
  const p = t.polls.find((x) => x.id === pollId) ?? reject('Unknown poll.');
  if (p.status !== 'open') reject('That poll is closed.');
  return p;
}

/** Members drag nights in the UI; dates re-flow from the first arrival. */
// ---------- plan edits (chat or Plan tab). Open until Pricing; any edit resets confirmations. ----------
const editable = (t: Trip) => {
  if (PHASES.indexOf(t.phase) >= PHASES.indexOf('PRICING')) reject('Prices are already being split, so the plan is locked.');
  t.confirms = [];
};
const describe = (t: Trip) => t.legs.map((l) => `${l.destination.name} ${l.nights}n (${l.arrive_date} → ${l.depart_date})`).join(', ');

/** One stop's nights; the trip length stays the same (rebalanceNights). A one-stop trip moves its end date instead. */
export function setNights(t: Trip, legId: string, nights: number): string {
  editable(t);
  const k = t.legs.findIndex((l) => l.id === legId);
  if (k < 0) reject('No such stop in the timeline yet.');
  if (nights < 1) reject('Each stop needs at least 1 night.');
  const before = t.legs.map((l) => l.nights);
  const n = t.legs.length === 1 ? [nights] : rebalanceNights(before, k, nights);
  if (!n) reject('The other stops are already down to 1 night. Change the trip dates to add more.');
  t.legs = redate(t.legs.map((l, i) => ({ ...l, nights: n![i] })));
  if (t.legs.length === 1 && t.window) t.window = { start: t.window.start, end: t.legs[0].depart_date };
  const moved = t.legs.flatMap((l, i) => (i !== k && l.nights !== before[i] ? [`${l.destination.name} ${before[i]}→${l.nights}`] : []));
  return `timeline_edited: ${describe(t)}.${moved.length ? ` To keep the trip length, adjusted ${moved.join(', ')}.` : ''}`;
}

/** Plan tab − / +: same rule, one stop at a time. */
export function editNights(t: Trip, nights: Record<string, number>): string {
  let event = '';
  for (const [legId, n] of Object.entries(nights)) event = setNights(t, legId, n);
  return event;
}

/** Replaces the list of stops, in order. Kept stops keep their id (and polls); new ones get 2 nights, then everything
 * is fitted to the trip window. Polls for dropped stops go away. */
export function setStops(t: Trip, stops: { name: string; country: string; nights?: number }[]): string {
  editable(t);
  if (!stops.length) reject('A trip needs at least one stop.');
  t.destinations = stops.map((s) => s.name);
  if (t.phase === 'DESTINATIONS' || !t.window) return `Stops are now ${t.destinations.join(' → ')}.`;
  const old = new Map(t.legs.map((l) => [l.destination.name.toLowerCase(), l]));
  const total = daysBetween(t.window.start, t.window.end);
  const n = fitNights(stops.map((s) => s.nights ?? old.get(s.name.toLowerCase())?.nights ?? 2), total);
  if (!n) reject(`${total} nights can't give ${stops.length} stops at least 1 night each. Make the trip longer first.`);
  t.legs = redate(stops.map((s, i) => {
    const prev = old.get(s.name.toLowerCase());
    return { id: prev?.id ?? id(), destination: { name: s.name, country: s.country }, nights: n![i], arrive_date: t.window!.start, depart_date: '', ...(prev?.transport_hint && { transport_hint: prev.transport_hint }) };
  }));
  const kept = new Set(t.legs.map((l) => l.id));
  t.polls = t.polls.filter((p) => !p.leg_id || kept.has(p.leg_id));
  return `timeline_edited: ${describe(t)}.`;
}

/** Name, dates and budget. New dates refit the stops' nights to the new length (fitNights) and re-date them. */
export function updateTrip(t: Trip, p: { name?: string; start_date?: string; end_date?: string; budget_per_person_cents?: number | null }): string {
  editable(t);
  if (p.name) t.name = p.name;
  if (p.budget_per_person_cents !== undefined) t.budget_per_person_cents = p.budget_per_person_cents ?? undefined;
  if (p.start_date || p.end_date) {
    const start = p.start_date ?? t.window?.start;
    const end = p.end_date ?? t.window?.end;
    if (!start || !end) reject('Give both a start and an end date.');
    if (!(end! > start!)) reject('The end date must be after the start date.');
    if (t.legs.length) {
      const n = fitNights(t.legs.map((l) => l.nights), daysBetween(start!, end!));
      if (!n) reject(`That is too short for ${t.legs.length} stops at 1 night each.`);
      t.legs = redate(t.legs.map((l, i) => ({ ...l, nights: n![i], ...(i === 0 && { arrive_date: start! }) })));
    }
    t.window = { start: start!, end: end! };
  }
  return `trip_updated: ${t.name}, ${t.window ? `${t.window.start} → ${t.window.end}` : 'no dates'}${t.legs.length ? `; ${describe(t)}` : ''}.`;
}

/** A member sets only their own ratio (invariant 7). Any change resets every acceptance. */
export function setRatio(t: Trip, previewId: string, m: number, bp: number): string {
  const p = editablePreview(t, previewId);
  const bps = rebalanceShares(p.shares.map((s) => s.ratio_bp), m, bp);
  // Everyone re-accepts the new amounts, except people not on a store bill (0%), who owe nothing there.
  p.shares.forEach((s, i) => Object.assign(s, { ratio_bp: bps[i], accepted: !!p.payee && bps[i] === 0 }));
  return `split_edited: ${t.members[m].name} set their share of ${p.title} to ${(bps[m] / 100).toFixed(2)}%; the others now have ${p.shares.flatMap((s, i) => (i === m ? [] : [`${t.members[i].name} ${(s.ratio_bp / 100).toFixed(2)}%`])).join(', ')}.`;
}

/** Only the trip owner (member 0) can reset everyone to equal. */
export function resetEqual(t: Trip, previewId: string, m: number) {
  if (m !== 0) reject('Only the trip owner can reset everyone to equal.');
  const p = editablePreview(t, previewId);
  equalBps(p.shares.length).forEach((bp, i) => Object.assign(p.shares[i], { ratio_bp: bp, accepted: false }));
}

/** Returns true when every member accepted and orders should go out. */
export function accept(t: Trip, previewId: string, m: number): boolean {
  const p = editablePreview(t, previewId);
  if (!shareAmounts(p)) reject('Shares must add up to 100% before anyone can accept.');
  p.shares[m].accepted = !p.shares[m].accepted;
  return (p.prepaid || !!p.payee) && p.shares.every((s) => s.accepted); // store bills also get PayPal requests
}

function editablePreview(t: Trip, previewId: string) {
  const p = t.previews.find((x) => x.id === previewId) ?? reject('Unknown price preview.');
  if (p.frozen) reject('Payment requests are out; shares are locked.');
  return p;
}

/** Freeze the preview and add one 'created' transaction per member (one row per member per money event). */
export function ordersCreated(t: Trip, p: Preview, orderIds: string[]): Txn[] {
  const cents = shareAmounts(p)!;
  const leg = t.legs.find((l) => l.id === p.leg_id);
  p.frozen = true;
  const rows = p.shares.flatMap((s, i): Txn[] => {
    if (!s.ratio_bp) return []; // a 0% share has nothing to pay
    Object.assign(s, { order_id: orderIds[i], status: 'created' });
    return [{
      id: `${p.id}-${i}`, member: i, paid_by: i, date: leg?.arrive_date ?? now().slice(0, 10), time: p.payee ? now().slice(11, 16) : '15:00', vendor: p.title,
      type: p.kind === 'stay' ? 'Hotel' : p.category ?? 'Restaurant', leg: leg?.destination.name ?? '', amount: cents[i], total: p.total_cents,
      shareBp: s.ratio_bp, source: p.payee ? 'In-store' : 'Prepaid share', status: 'created', nights: p.kind === 'stay' ? leg?.nights : undefined,
    }];
  });
  t.txs.push(...rows);
  return rows;
}

/** Webhook-only status change (invariant 3). Returns the touched row plus any follow-up event. */
export function paymentStatus(orderId: string, status: 'approved' | 'captured' | 'failed') {
  for (const t of trips.values())
    for (const p of t.previews) {
      const i = p.shares.findIndex((s) => s.order_id === orderId);
      if (i < 0) continue;
      if (p.shares[i].status === 'captured') return null; // never downgrade a capture
      p.shares[i].status = status;
      const row = t.txs.find((x) => x.id === `${p.id}-${i}`)!;
      row.status = status;
      let event: string | null = null;
      if (status === 'failed') event = `payment_failed: ${t.members[i].name}'s payment for ${p.title} did not go through.`;
      const prepaid = t.previews.filter((x) => x.prepaid);
      const everyStay = t.legs.every((l) => prepaid.some((x) => x.kind === 'stay' && x.leg_id === l.id)); // no stop left unbooked
      if (t.phase === 'PRICING' && prepaid.length && everyStay && prepaid.every((x) => x.frozen && x.shares.every((s) => !s.ratio_bp || s.status === 'captured'))) {
        t.phase = 'BOOKED';
        t.confirms = [];
        event = 'phase_changed: every prepaid share is paid, phase is now BOOKED.';
      }
      return { trip: t, row, event };
    }
  return null;
}

/** In-store bill: someone at the counter enters the store's PayPal email and total; it starts split equally among the
 * members on it. Once everyone on it accepts, each gets a PayPal request that pays the store directly. */
export function createStoreBill(t: Trip, m: number, b: { vendor: string; email: string; total: number; category: string; members: number[] }): Preview {
  if (t.phase === 'SETTLED') reject('This trip is settled.');
  const on = [...new Set(b.members)].filter((i) => i >= 0 && i < t.members.length);
  if (!on.includes(m)) on.push(m);
  const eq = equalBps(on.length);
  const p: Preview = {
    id: id(), option_id: '', kind: 'store', title: b.vendor, meta: `In-store · added by ${t.members[m].name}`,
    payee: { name: b.vendor, email: b.email.trim().toLowerCase() }, category: b.category,
    total_cents: b.total, currency: t.currency, prepaid: false, frozen: false, is_estimate: true,
    shares: t.members.map((_, i) => ({ member: i, ratio_bp: on.includes(i) ? eq[on.indexOf(i)] : 0, accepted: !on.includes(i), status: 'none' })),
  };
  t.previews.push(p);
  return p;
}

/** On-trip expense: one row per member share, all paid by the logger. */
export function logExpense(t: Trip, m: number, e: { date: string; time: string; vendor: string; type: string; total: number; bps: number[] }): Txn[] {
  if (e.bps.length !== t.members.length || e.bps.reduce((a, b) => a + b, 0) !== 10000) reject('Split must cover every member and total 100%.');
  const cents = shareAmounts({ total_cents: e.total, shares: e.bps.map((ratio_bp) => ({ ratio_bp })) } as Preview)!;
  const leg = t.legs.find((l) => e.date >= l.arrive_date && e.date < l.depart_date) ?? t.legs.at(-1);
  const base = id();
  const rows = cents.flatMap((amount, i): Txn[] => (amount ? [{
    id: `${base}-${i}`, member: i, paid_by: m, date: e.date, time: e.time, vendor: e.vendor, type: e.type, leg: leg?.destination.name ?? '',
    amount, total: e.total, shareBp: e.bps[i], source: 'On-trip log', status: 'logged',
  }] : []));
  t.txs.push(...rows);
  return rows;
}

/** What Wayfinder sees: no chat (it gets that separately) and no PayPal order ids. */
export const publicState = (t: Trip) => ({
  ...t, chat: undefined, busy: undefined, code: undefined,
  members: t.members.map(({ user: _, ...m }) => m), // PayPal ids stay out of the model prompt
  previews: t.previews.map((p) => ({ ...p, shares: p.shares.map(({ order_id: _, ...s }) => s) })),
  trip_window_nights: t.window ? Math.round((Date.parse(t.window.end) - Date.parse(t.window.start)) / 864e5) : null,
  today: now().slice(0, 10),
});

