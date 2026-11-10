// Shared trip data + pure money logic for web and mobile. No imports, so Vite, Metro and `node --test` all load it as-is.
// Money is integer cents; ratios are basis points summing to 10000 (claudee.md invariants 1–2).
// shortcut: sample data stands in for the Backend API, replace with fetches once Backend exists.

export type Member = { id: string; name: string; symbol: string; color: string; tint: string; me?: boolean };
export type TxStatus = 'captured' | 'approved' | 'created' | 'logged' | 'failed';
export type Tx = {
  member: number; // index into members
  day: number; // day of May 2027
  time: string;
  vendor: string;
  type: string;
  leg: string;
  amount: number;
  total: number;
  shareBp: number;
  source: 'Prepaid share' | 'On-trip log' | 'Online purchase';
  status: TxStatus;
  nights?: number; // prepaid stays span their leg on the schedule
};
export type Bill = {
  id: 'dinner' | 'stay';
  kind: string;
  title: string;
  meta: string;
  total: number;
  bps: number[];
  locked: boolean[];
  accepted: boolean[];
  frozen: boolean; // PayPal orders are out; bars can't move
  paid: boolean; // viewer's optimistic "approved in PayPal" (webhooks own the real status)
  payState?: string[];
};

export const ME = 3;
export const members: Member[] = [
  { id: 'maya', name: 'Maya', symbol: '◆', color: '#BE185D', tint: '#FCE7F3' },
  { id: 'alex', name: 'Alex', symbol: '▲', color: '#C2410C', tint: '#FBE3D6' },
  { id: 'sam', name: 'Sam', symbol: '●', color: '#15803D', tint: '#DCF0E1' },
  { id: 'priya', name: 'Priya', symbol: '★', color: '#7E22CE', tint: '#EEDFF9', me: true },
];
export const displayName = (i: number) => (members[i].me ? `${members[i].name} (you)` : members[i].name);

export const trip = { name: 'Iberia in May', dates: 'May 14–23', nights: 9, currency: 'EUR', phase: 'Booking', firstDay: 14, lastDay: 23 };

export const legs = [
  { name: 'Lisbon', from: 14, to: 17, nights: 3, transport: '', status: 'Stay booked', tone: 'blue' },
  { name: 'Seville', from: 17, to: 19, nights: 2, transport: 'train', status: 'Collecting · 2 of 4 paid', tone: 'orange' },
  { name: 'Barcelona', from: 19, to: 23, nights: 4, transport: 'flight', status: 'Stay poll open', tone: 'gray' },
] as const;
export const legOf = (day: number) => legs.find((l) => day >= l.from && day < l.to)?.name ?? (day === trip.lastDay ? 'Barcelona' : null);

const prepaid = (member: number, day: number, vendor: string, leg: string, amount: number, total: number, shareBp: number, status: TxStatus, nights: number): Tx => ({
  member, day, time: '15:00', vendor, type: 'Hotel', leg, amount, total, shareBp, source: 'Prepaid share', status, nights,
});
const logged = (member: number, day: number, time: string, vendor: string, type: string, leg: string, amount: number, source: Tx['source'] = 'On-trip log', status: TxStatus = 'logged'): Tx => ({
  member, day, time, vendor, type, leg, amount, total: amount, shareBp: 10000, source, status,
});

export const initialTxs: Tx[] = [
  prepaid(0, 14, 'Casa do Largo', 'Lisbon · leg 1', 19500, 78000, 2500, 'captured', 3),
  prepaid(1, 14, 'Casa do Largo', 'Lisbon · leg 1', 19500, 78000, 2500, 'captured', 3),
  prepaid(2, 14, 'Casa do Largo', 'Lisbon · leg 1', 19500, 78000, 2500, 'captured', 3),
  prepaid(3, 14, 'Casa do Largo', 'Lisbon · leg 1', 19500, 78000, 2500, 'captured', 3),
  logged(0, 15, '20:40', 'Taberna da Rua', 'Restaurant', 'Lisbon · leg 1', 4820),
  logged(1, 16, '11:05', 'Bolt', 'Transport', 'Lisbon · leg 1', 1460),
  logged(2, 16, '13:30', 'Mercado da Ribeira', 'Restaurant', 'Lisbon · leg 1', 6240),
  { ...prepaid(0, 17, 'Patio Azahar', 'Seville · leg 2', 28942, 124000, 2334, 'captured', 2), time: '14:00' },
  { ...prepaid(1, 17, 'Patio Azahar', 'Seville · leg 2', 37200, 124000, 3000, 'captured', 2), time: '14:00' },
  { ...prepaid(2, 17, 'Patio Azahar', 'Seville · leg 2', 28929, 124000, 2333, 'approved', 2), time: '14:00' },
  { ...prepaid(3, 17, 'Patio Azahar', 'Seville · leg 2', 28929, 124000, 2333, 'created', 2), time: '14:00' },
  logged(1, 18, '09:12', 'Farmacia online', 'Store', 'Seville · leg 2', 1899, 'Online purchase', 'captured'),
];

// Items on the calendar that aren't transactions yet.
export const planned = [
  { day: 18, title: 'Bodega Triana tasting menu — 9:00 PM', meta: 'Price preview · split bars open', amount: 34000 },
  { day: 19, title: 'Barcelona stay', meta: 'Poll open · closes Fri 6:00 PM · nothing booked', amount: null },
];

export const initialBills: Bill[] = [
  {
    id: 'dinner', kind: 'Dining · prepaid · Seville', title: 'Bodega Triana tasting menu', meta: 'Tue, May 18 · 9:00 PM · 4 guests',
    total: 34000, bps: [2500, 2500, 2500, 2500], locked: [false, false, false, false], accepted: [true, true, false, false], frozen: false, paid: false,
  },
  {
    id: 'stay', kind: 'Stay · prepaid · Seville', title: 'Patio Azahar', meta: '2 nights · May 17–19 · paid to Maya (collector)',
    total: 124000, bps: [2334, 3000, 2333, 2333], locked: [false, true, false, false], accepted: [true, true, true, true], frozen: true, paid: false,
    payState: ['Captured', 'Captured', 'Approved · capturing', 'Awaiting your payment'],
  },
];

export const pollOptions = [
  { id: 'a', name: 'Gràcia loft apartment', price: '€212 / night · €848 total', why: 'Sleeps 4 in two bedrooms, 8 min walk to the metro, full kitchen.', addedBy: 'Suggested by Wayfinder', voters: [0, 2] },
  { id: 'b', name: 'Barceloneta beach hotel', price: '€265 / night · €1,060 total', why: 'Two doubles, breakfast included, closest to the beach.', addedBy: 'Added by Alex', voters: [1] },
  { id: 'c', name: 'Eixample design hostel', price: '€148 / night · €592 total', why: 'Cheapest private quad; shared lounge, central location.', addedBy: 'Suggested by Wayfinder', voters: [] as number[] },
];

export const products = [
  { id: 'p1', title: 'Ultralight packable rain shell', price: 7400, offers: '3 offers · Northpack Outfitters', merchant: 'northpack.example', paypal: true },
  { id: 'p2', title: 'Stowaway hooded rain jacket', price: 5995, offers: '2 offers · Ridge & Co', merchant: 'ridgeandco.example', paypal: false },
  { id: 'p3', title: '2.5-layer travel rain jacket', price: 7900, offers: '4 offers · Alto Gear', merchant: 'altogear.example', paypal: true },
  { id: 'p4', title: 'Pocketable poncho jacket', price: 3250, offers: '1 offer · Ridge & Co', merchant: 'ridgeandco.example', paypal: false },
  { id: 'p5', title: 'Waterproof city trench, packable', price: 7800, offers: '2 offers · Harbor Lane', merchant: 'harborlane.example', paypal: true },
  { id: 'p6', title: 'Recycled nylon wind & rain shell', price: 6400, offers: '3 offers · Alto Gear', merchant: 'altogear.example', paypal: true },
];

export type ChatMsg = { from: number | 'ai'; time: string; text: string; card?: 'stay' | 'dinner' };
export const initialChat: ChatMsg[] = [
  { from: 'ai', time: '10:02', text: 'The Seville stay poll closed — Patio Azahar won 3–1. Everyone accepted their bars, so PayPal orders are out.', card: 'stay' },
  { from: 1, time: '10:06', text: 'Took the terrace room — I already moved my bar to 30% on the bill.' },
  { from: 2, time: '10:11', text: 'Approved mine in PayPal. Can we do the tasting menu on the 18th?' },
  { from: 'ai', time: '10:12', text: 'Added Bodega Triana (May 18, €340.00) to Split bills — set your bar there. The Barcelona stay poll closes Fri 6:00 PM — 2 of 4 have voted.', card: 'dinner' },
  { from: ME, time: '10:15', text: 'Paying tonight! Voting on Barcelona now.' },
];

// ---------- money ----------

export const eur = (cents: number) =>
  (cents < 0 ? '-€' : '€') + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (bp: number) => (bp / 100).toFixed(2) + '%';

/** Split integer `total` by `weights`; result sums to `total` exactly. Ties go to the lower index (stable order). */
export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const sw = w.reduce((a, b) => a + b, 0);
  const exact = w.map((x) => (total * x) / sw);
  const out = exact.map(Math.floor);
  const left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, f: e - Math.floor(e) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; k < left; k++) out[order[k % order.length].i] += 1;
  return out;
}

export const billAmounts = (b: Bill) => largestRemainder(b.total, b.bps);

/** Move member i's bar to v bp; unlocked others rebalance so the sum stays 10000. Any change resets every acceptance (invariant 7). */
export function setShare(b: Bill, i: number, v: number): Bill {
  if (b.frozen || b.locked[i]) return b;
  const lockedSum = b.bps.reduce((a, x, j) => a + (j !== i && b.locked[j] ? x : 0), 0);
  const free = b.bps.map((_, j) => j).filter((j) => j !== i && !b.locked[j]);
  if (!free.length) return b;
  const val = Math.max(0, Math.min(Math.round(v), 10000 - lockedSum));
  const split = largestRemainder(10000 - lockedSum - val, free.map((j) => b.bps[j]));
  const bps = b.bps.slice();
  bps[i] = val;
  free.forEach((j, k) => (bps[j] = split[k]));
  return { ...b, bps, accepted: b.accepted.map(() => false) };
}
export const toggleLock = (b: Bill, i: number): Bill => (b.frozen ? b : { ...b, locked: b.locked.map((l, j) => (j === i ? !l : l)) });
export const splitEqually = (b: Bill): Bill =>
  b.frozen ? b : { ...b, bps: largestRemainder(10000, b.bps.map(() => 1)), locked: b.locked.map(() => false), accepted: b.accepted.map(() => false) };
export const primaryAction = (b: Bill): Bill =>
  b.frozen ? { ...b, paid: !b.paid } : { ...b, accepted: b.accepted.map((a, j) => (j === ME ? !a : a)) };

export function billView(b: Bill) {
  const cents = billAmounts(b);
  const accepted = b.accepted.filter(Boolean).length;
  const done = b.frozen ? b.paid : b.accepted[ME];
  return {
    cents,
    pill: b.frozen ? 'Collecting' : 'Price preview',
    note: (i: number) =>
      b.payState ? (i === ME && b.paid ? 'Approved · capturing' : b.payState[i]) : (b.accepted[i] ? 'Accepted' : 'Not accepted yet') + (b.locked[i] ? ' · locked' : ''),
    foot: b.frozen ? `2 of 4 paid${b.paid ? ' · 2 approved' : ''} · €661.42 captured` : `${accepted} of 4 accepted · shares always total ${eur(b.total)}`,
    primaryLabel: b.frozen ? (b.paid ? 'Approved in PayPal' : `Pay my share · ${eur(cents[ME])}`) : done ? 'Accepted' : `Accept ${eur(cents[ME])}`,
    done,
  };
}

// ---------- search (client stand-in for the Elasticsearch query) ----------

/** "hotel > 100" → every word must match a text field; "> N" / "< N" filter by amount in euros. */
export function parseQuery(query: string) {
  const range: { op: '>' | '<'; cents: number }[] = [];
  const text = query.replace(/([<>])\s*[€$£]?\s*(\d+(?:\.\d{1,2})?)/g, (_, op, n) => {
    range.push({ op, cents: Math.round(parseFloat(n) * 100) });
    return ' ';
  });
  return { words: text.toLowerCase().split(/\s+/).filter(Boolean), range };
}
export function searchTxs(txs: Tx[], query: string): Tx[] {
  const { words, range } = parseQuery(query);
  return txs.filter((t) => {
    const hay = [members[t.member].name, t.vendor, t.type, t.leg, t.source, t.status].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w)) && range.every((r) => (r.op === '>' ? t.amount > r.cents : t.amount < r.cents));
  });
}

// ---------- rollups for dashboard / insights ----------

export function summarize(txs: Tx[]) {
  const sum = (f: (t: Tx) => boolean) => txs.filter(f).reduce((a, t) => a + t.amount, 0);
  const total = sum(() => true);
  const prepaidTotal = [...new Map(txs.filter((t) => t.source === 'Prepaid share').map((t) => [t.vendor, t.total])).values()].reduce((a, b) => a + b, 0);
  const prepaidCollected = sum((t) => t.source === 'Prepaid share' && t.status === 'captured');
  const byType = [...new Set(txs.map((t) => t.type))].map((type) => ({ type, amount: sum((t) => t.type === type) })).sort((a, b) => b.amount - a.amount);
  return {
    total,
    count: txs.length,
    captured: sum((t) => t.status === 'captured'),
    logged: sum((t) => t.status === 'logged'),
    pending: sum((t) => t.status === 'approved' || t.status === 'created'),
    prepaidTotal,
    prepaidCollected,
    avg: Math.round(total / members.length),
    byMember: members.map((_, i) => sum((t) => t.member === i)),
    byLeg: legs.map((l) => ({ name: l.name, perMember: members.map((_, i) => sum((t) => t.member === i && t.leg.startsWith(l.name))) })),
    byType,
  };
}

/** May 2027 month grid (Sun-first), 6 weeks. */
export function mayGrid() {
  const lead = new Date(Date.UTC(2027, 4, 1)).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => {
    const d = i - lead + 1;
    return d >= 1 && d <= 31 ? { day: d, inMonth: true } : { day: d < 1 ? 30 + d : d - 31, inMonth: false };
  });
}

// ---------- Wayfinder (client stand-in for the server-side Claude turn, ai.md §3 and §6) ----------

/**
 * Reply text, or null to stay silent. Speaks only when @mentioned (ai.md §3); never moves money or edits splits (§6.1–2);
 * every amount comes from trip data, never invented (§6.6).
 * shortcut: keyword routing instead of Claude + tools; replace with a Backend call once the API exists (the key can't ship in clients).
 */
export function wayfinderReply(text: string, txs: Tx[], vote: string | null): string | null {
  const t = text.toLowerCase();
  if (!/\bwayfinder\b/.test(t)) return null;
  if (/\b(pay|refund|transfer|send money|charge)\b/.test(t))
    return "I can't move money. Each of you approves your own share in PayPal — tap Pay my share on the bill in Split bills.";
  if (/\b(split|share|bar|ratio)s?\b/.test(t))
    return 'Only you can change your own bar, in Split bills. Any change resets everyone\'s acceptance, and the trip owner can reset all to equal.';
  if (/\b(spent|spend|balance|owe|total|money)\b/.test(t)) {
    const sm = summarize(txs);
    return `So far: ${members.map((m, i) => `${m.name} ${eur(sm.byMember[i])}`).join(', ')} — ${eur(sm.total)} in total. ${eur(sm.pending)} is still waiting on PayPal.`;
  }
  if (/\b(poll|vote|barcelona|stay)\b/.test(t)) {
    const votes = pollOptions.map((o) => o.voters.length + (vote === o.id ? 1 : 0));
    const voted = votes.reduce((a, b) => a + b, 0);
    const lead = pollOptions.map((o, k) => `${o.name} ${votes[k]}`).join(', ');
    return `🏨 Barcelona stay poll: ${voted} of ${members.length} have voted (${lead}). It closes Fri 6:00 PM. Prices are estimates until booking.`;
  }
  if (/\b(schedule|timeline|plan|when|where|nights?|itinerary)\b/.test(t))
    return `${trip.dates}: ${legs.map((l) => `${l.name} ${l.nights} nights${l.transport ? ` (${l.transport} in)` : ''}`).join(' → ')}.`;
  return 'I can help with the schedule, who has spent what, or the Barcelona poll. What do you need?';
}

// ========== Live trip model (web + Backend) ==========
// A first-time trip starts empty and walks the ai.md §2 phases. Backend owns the state; the web renders it.

export type Phase = 'DESTINATIONS' | 'TIMELINE' | 'PLACES' | 'PRICING' | 'BOOKED' | 'ON_TRIP' | 'SETTLED';
export const PHASES: Phase[] = ['DESTINATIONS', 'TIMELINE', 'PLACES', 'PRICING', 'BOOKED', 'ON_TRIP', 'SETTLED'];
export const PHASE_LABEL: Record<Phase, string> = {
  DESTINATIONS: 'Destinations', TIMELINE: 'Timeline', PLACES: 'Places', PRICING: 'Pricing', BOOKED: 'Booked', ON_TRIP: 'On trip', SETTLED: 'Settled',
};
export type Person = { name: string; symbol: string; color: string; tint: string; user?: string }; // user: PayPal id once they log in
/** Color + symbol per member slot, never color alone (invariant 10). */
export const PALETTE: Omit<Person, 'name' | 'user'>[] = [
  ...members.map(({ symbol, color, tint }) => ({ symbol, color, tint })),
  { symbol: '■', color: '#1D4ED8', tint: '#DBE7FB' },
  { symbol: '◗', color: '#0F766E', tint: '#D5F0EC' },
  { symbol: '✚', color: '#B91C1C', tint: '#F9DEDE' },
  { symbol: '⬟', color: '#4D7C0F', tint: '#E4F0D3' },
];
export type Transport = 'flight' | 'train' | 'drive' | 'ferry' | 'none';
export type Leg = { id: string; destination: { name: string; country: string }; nights: number; arrive_date: string; depart_date: string; transport_hint?: Transport };
export type PlacePrice = { amount_cents: number; currency: string; unit: 'per_night' | 'total' | 'per_person' };
export type PlaceOption = {
  id: string; name: string; address?: string; price: PlacePrice | null; rating?: number;
  source: 'web_search' | 'member_added' | 'channel3'; source_url?: string; why: string; added_by: number | 'ai'; voters: number[];
};
export type Poll = { id: string; kind: 'destination' | 'stay' | 'dining' | 'custom'; leg_id?: string; question: string; options: PlaceOption[]; status: 'open' | 'closed'; winner?: string };
export type ShareStatus = 'none' | 'created' | 'approved' | 'captured' | 'failed';
export type Share = { member: number; ratio_bp: number; accepted: boolean; status: ShareStatus; order_id?: string };
export type Preview = {
  id: string; option_id: string; leg_id?: string; kind: 'stay' | 'dining'; title: string; meta: string;
  total_cents: number; currency: string; prepaid: boolean; shares: Share[]; frozen: boolean; is_estimate: true;
};
export type Txn = {
  id: string; member: number; paid_by: number; date: string; time: string; vendor: string; type: string; leg: string;
  amount: number; total: number; shareBp: number; source: Tx['source']; status: TxStatus; nights?: number;
};
export type LiveMsg = { from: number | 'ai'; at: string; text: string };
export type Trip = {
  id: string; name: string; currency: string; phase: Phase; members: Person[]; code: string; // code: what friends type to join
  window: { start: string; end: string } | null; budget_per_person_cents?: number;
  destinations: string[]; legs: Leg[]; polls: Poll[]; previews: Preview[]; chat: LiveMsg[]; txs: Txn[];
  confirms: number[]; busy: boolean; solo?: boolean; // solo: one traveler, join code closed
  invites?: { user: string; name: string }[]; // accounts invited by email that haven't accepted yet
};

export const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

/** ISO date + n days, UTC so time zones never shift the day. */
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** ai.md §2.2: contiguous legs, depart = arrive + nights, total nights fit the window exactly. */
export function validateTimeline(legs: Leg[], window: Trip['window']): string[] {
  const errs: string[] = [];
  if (!legs.length) return ['No legs yet.'];
  legs.forEach((l, k) => {
    if (l.nights < 1) errs.push(`${l.destination.name}: needs at least 1 night.`);
    if (addDays(l.arrive_date, l.nights) !== l.depart_date) errs.push(`${l.destination.name}: depart date must be arrive date + ${l.nights} nights.`);
    const prev = legs[k - 1];
    if (prev && prev.depart_date !== l.arrive_date) errs.push(`Gap or overlap between ${prev.destination.name} and ${l.destination.name}.`);
  });
  if (window) {
    if (legs[0].arrive_date !== window.start) errs.push(`Trip should start on ${window.start}.`);
    if (legs[legs.length - 1].depart_date !== window.end) errs.push(`Trip should end on ${window.end}.`);
  }
  return errs;
}

/** Re-date legs after a nights edit, keeping the first arrival fixed. */
export function redate(legs: Leg[]): Leg[] {
  let at = legs[0]?.arrive_date;
  return legs.map((l) => {
    const leg = { ...l, arrive_date: at, depart_date: addDays(at, l.nights) };
    at = leg.depart_date;
    return leg;
  });
}

export const ratioSum = (p: Preview) => p.shares.reduce((a, s) => a + s.ratio_bp, 0);
/** Cents per share, or null while ratios don't sum to 100% (ai.md §2.4: nobody else's ratio moves). */
export const shareAmounts = (p: Preview) => (ratioSum(p) === 10000 ? largestRemainder(p.total_cents, p.shares.map((s) => s.ratio_bp)) : null);
export const equalBps = (n: number) => largestRemainder(10000, Array(n).fill(1));

export function pollTally(p: Poll) {
  const votes = p.options.map((o) => o.voters.length);
  const top = Math.max(0, ...votes);
  return { votes, voted: new Set(p.options.flatMap((o) => o.voters)).size, leaders: top ? p.options.filter((_, k) => votes[k] === top).map((o) => o.id) : [] };
}

/** Paid minus owed per member, from captured and logged rows only. */
export function balances(txs: Txn[], n: number): number[] {
  const out = Array(n).fill(0);
  for (const t of txs) {
    if (t.status !== 'captured' && t.status !== 'logged') continue;
    out[t.paid_by] += t.amount;
    out[t.member] -= t.amount;
  }
  return out;
}

/** Greedy largest-debtor → largest-creditor; at most n-1 transfers, every cent accounted for. */
export function settle(bal: number[]): { from: number; to: number; amount: number }[] {
  const b = bal.slice();
  const out: { from: number; to: number; amount: number }[] = [];
  for (;;) {
    const d = b.indexOf(Math.min(...b));
    const c = b.indexOf(Math.max(...b));
    const amt = Math.min(-b[d], b[c]);
    if (amt <= 0) return out;
    out.push({ from: d, to: c, amount: amt });
    b[d] += amt;
    b[c] -= amt;
  }
}

export function searchTxns(txs: Txn[], people: Person[], query: string): Txn[] {
  const { words, range } = parseQuery(query);
  return txs.filter((t) => {
    const hay = [people[t.member]?.name, t.vendor, t.type, t.leg, t.source, t.status].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w)) && range.every((r) => (r.op === '>' ? t.amount > r.cents : t.amount < r.cents));
  });
}

export function summarizeTrip(t: Trip) {
  const sum = (f: (x: Txn) => boolean) => t.txs.filter(f).reduce((a, x) => a + x.amount, 0);
  const total = sum((x) => x.status !== 'failed');
  return {
    total,
    count: t.txs.length,
    captured: sum((x) => x.status === 'captured'),
    logged: sum((x) => x.status === 'logged'),
    pending: sum((x) => x.status === 'approved' || x.status === 'created'),
    prepaidTotal: t.previews.filter((p) => p.frozen).reduce((a, p) => a + p.total_cents, 0),
    prepaidCollected: sum((x) => x.source === 'Prepaid share' && x.status === 'captured'),
    byMember: t.members.map((_, i) => sum((x) => x.member === i && x.status !== 'failed')),
    byType: [...new Set(t.txs.map((x) => x.type))].map((type) => ({ type, amount: sum((x) => x.type === type && x.status !== 'failed') })),
    byLeg: t.legs.map((l) => ({ name: l.destination.name, perMember: t.members.map((_, i) => sum((x) => x.member === i && x.leg === l.destination.name && x.status !== 'failed')) })),
  };
}

/** One member's slice of a trip for the home page: what they spent, what's waiting on them. */
export function mySummary(t: Trip, m: number) {
  const mine = t.txs.filter((x) => x.member === m);
  const sum = (f: (x: Txn) => boolean) => mine.filter(f).reduce((a, x) => a + x.amount, 0);
  const todos = t.previews.flatMap((p) => {
    const s = p.shares[m];
    if (!s || s.status === 'captured') return [];
    const cents = shareAmounts(p)?.[m] ?? null;
    if (!p.frozen) return s.accepted ? [] : [{ title: p.title, cents, cta: 'Open split' }];
    return s.status === 'created' ? [{ title: p.title, cents, cta: 'Pay my share' }] : [];
  });
  return {
    spent: sum((x) => x.status === 'captured' || x.status === 'logged'),
    pending: sum((x) => x.status === 'approved' || x.status === 'created'),
    byType: [...new Set(mine.map((x) => x.type))].map((type) => ({ type, amount: sum((x) => x.type === type && x.status !== 'failed') })),
    recent: mine.filter((x) => x.status !== 'failed').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 5),
    todos,
  };
}

/** Why the group can't press Confirm yet, or null when it can (ai.md §2). */
export function confirmBlocker(t: Trip): string | null {
  if (!t.solo && t.members.length < 2) return 'A group trip needs at least one more person. Share the join code or invite them by email.';
  switch (t.phase) {
    case 'DESTINATIONS': return t.destinations.length && t.window ? null : 'Tell Wayfinder where and when you want to go first.';
    case 'TIMELINE': return validateTimeline(t.legs, t.window)[0] ?? null;
    case 'PLACES': {
      const open = t.legs.find((l) => !t.polls.some((p) => p.kind === 'stay' && p.leg_id === l.id && p.status === 'closed' && p.winner));
      return open ? `Pick a stay for ${open.destination.name} first.` : null;
    }
    case 'PRICING': return t.previews.some((p) => p.prepaid) ? 'Booking happens when every prepaid share is paid.' : null;
    case 'SETTLED': return 'This trip is settled.';
    default: return null;
  }
}
export const CONFIRM_LABEL: Partial<Record<Phase, string>> = {
  DESTINATIONS: 'Confirm destinations', TIMELINE: 'Confirm timeline', PLACES: 'Confirm places', PRICING: 'Confirm (nothing prepaid)', BOOKED: 'Start the trip', ON_TRIP: 'Mark trip settled',
};
