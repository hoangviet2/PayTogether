// Trip state and every rule-bearing mutation. Pure-ish: no network; callers run side effects (PayPal, Elastic, Wayfinder).
// shortcut: one JSON file instead of Postgres + Prisma; move to the claudee.md stack before more than one server runs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import {
  PALETTE, PHASES, confirmBlocker, equalBps, pollTally, redate, shareAmounts, validateTimeline,
  type Leg, type PlaceOption, type Poll, type Preview, type Trip, type Txn,
} from '../../FrontEnd/shared/trip.ts';

const FILE = process.env.DATA_FILE ?? new URL('../data.json', import.meta.url).pathname;
export const trips = new Map<string, Trip>(existsSync(FILE) ? Object.entries(JSON.parse(readFileSync(FILE, 'utf8'))) : []);
// Code alphabet without look-alikes (0/O, 1/I/L) so it can be read out loud.
const newCode = (): string => {
  const c = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[randomInt(31)]).join('');
  return [...trips.values()].some((t) => t.code === c) ? newCode() : c;
};
for (const t of trips.values()) t.code ??= newCode(); // trips saved before join codes existed
export const save = () => {
  if (process.env.DATA_FILE !== ':memory:') writeFileSync(FILE, JSON.stringify(Object.fromEntries(trips)));
};
const id = () => randomUUID().slice(0, 8);
const now = () => new Date().toISOString();
export class Rejected extends Error {}
const reject = (msg: string): never => { throw new Rejected(msg); };

export const OPENING =
  "Hi everyone 👋 I'm Wayfinder. Where do you want to go? Drop cities, regions, or even a vibe (\"somewhere warm with good food\") — plus rough dates and budget if you have them.";

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
  say(t, 'ai', `${name} joined the trip 👋`);
  return t.members.length - 1;
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
  return `phase_changed: the group confirmed, phase is now ${t.phase}.`;
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
export function editNights(t: Trip, nights: Record<string, number>): string {
  if (t.phase !== 'TIMELINE') reject('The timeline is confirmed.');
  t.legs = redate(t.legs.map((l) => ({ ...l, nights: nights[l.id] ?? l.nights })));
  t.confirms = [];
  const errs = validateTimeline(t.legs, t.window);
  return `timeline_edited: ${t.legs.map((l) => `${l.destination.name} ${l.nights}n`).join(', ')}. ${errs.length ? 'Problems: ' + errs.join(' ') : 'Dates check out.'}`;
}

/** A member sets only their own ratio (invariant 7). Any change resets every acceptance. */
export function setRatio(t: Trip, previewId: string, m: number, bp: number): string {
  const p = editablePreview(t, previewId);
  p.shares[m].ratio_bp = Math.max(0, Math.min(10000, Math.round(bp)));
  p.shares.forEach((s) => (s.accepted = false));
  const off = p.shares.reduce((a, s) => a + s.ratio_bp, 0) - 10000;
  return `split_edited: ${t.members[m].name} set their share of ${p.title} to ${(p.shares[m].ratio_bp / 100).toFixed(2)}%. ${off ? `Ratios are ${off > 0 ? 'over' : 'under'} 100% by ${(Math.abs(off) / 100).toFixed(2)}%.` : 'Ratios sum to 100%.'}`;
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
  return p.prepaid && p.shares.every((s) => s.accepted);
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
  const rows = p.shares.map((s, i): Txn => {
    Object.assign(s, { order_id: orderIds[i], status: 'created' });
    return {
      id: `${p.id}-${i}`, member: i, paid_by: i, date: leg?.arrive_date ?? now().slice(0, 10), time: '15:00', vendor: p.title,
      type: p.kind === 'stay' ? 'Hotel' : 'Restaurant', leg: leg?.destination.name ?? '', amount: cents[i], total: p.total_cents,
      shareBp: s.ratio_bp, source: 'Prepaid share', status: 'created', nights: p.kind === 'stay' ? leg?.nights : undefined,
    };
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
      if (t.phase === 'PRICING' && prepaid.length && prepaid.every((x) => x.frozen && x.shares.every((s) => s.status === 'captured'))) {
        t.phase = 'BOOKED';
        t.confirms = [];
        event = 'phase_changed: every prepaid share is paid, phase is now BOOKED.';
      }
      return { trip: t, row, event };
    }
  return null;
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
