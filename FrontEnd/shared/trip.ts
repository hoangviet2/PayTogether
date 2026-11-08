// Shared trip data + pure money logic for web and mobile. No imports, so Vite, Metro and `node --test` all load it as-is.
// Money is integer cents; ratios are basis points summing to 10000 (claudee.md invariants 1–2).
// shortcut: sample data stands in for the Backend API, replace with fetches once Backend exists.

export type Member = { id: string; name: string; symbol: string; color: string; tint: string; me?: boolean };
export type TxStatus = 'captured' | 'approved' | 'created' | 'logged';
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
export function searchTxs(txs: Tx[], query: string): Tx[] {
  const range: { op: '>' | '<'; cents: number }[] = [];
  const text = query.replace(/([<>])\s*€?\s*(\d+(?:\.\d{1,2})?)/g, (_, op, n) => {
    range.push({ op, cents: Math.round(parseFloat(n) * 100) });
    return ' ';
  });
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
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
