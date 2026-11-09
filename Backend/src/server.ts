// PayTogether API on node:http. The web app reaches it through Vite's /api proxy (FrontEnd/web/vite.config.ts).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { searchTxns, shareAmounts, type Trip, type Txn } from '../../FrontEnd/shared/trip.ts';
import * as store from './store.ts';
import * as ext from './integrations.ts';
import { runTurn, shouldReply } from './wayfinder.ts';

const PORT = Number(process.env.PORT ?? 8787);
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // set on any public host; the web dev proxy sends it (FrontEnd/web/vite.config.ts)
const seenEvents = new Set<string>(); // shortcut: in-memory webhook dedupe; persist it with the store when moving to Postgres

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const persist = () => store.save();
const reindex = (t: Trip, rows: Txn[]) => rows.forEach((r) => ext.indexTxn(t.id, r, t.members).catch((e) => console.error('Elastic index failed:', e.message)));
const OFFLINE = 'I am offline: set ANTHROPIC_API_KEY in Backend/.env and restart the server.';
const wayfinder = (t: Trip, trigger: string | null) => {
  if (!trigger) return;
  if (!ext.ready.claude) {
    if (!t.chat.some((c) => c.text === OFFLINE)) store.say(t, 'ai', OFFLINE); // once per trip, not after every message
    return persist();
  }
  runTurn(t, trigger, persist);
};

async function body<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, 'Body too large');
  }
  const parsed = schema.safeParse(raw ? JSON.parse(raw) : {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return parsed.data;
}

/** shortcut: the acting member comes from a header the web app sets ("acting as" switcher).
 * Replace with a Log in with PayPal session before real users; until then anyone can act as any member. */
function member(req: IncomingMessage, t: Trip) {
  const m = Number(req.headers['x-member']);
  if (!Number.isInteger(m) || m < 0 || m >= t.members.length) throw new HttpError(403, 'Pick which member you are.');
  return m;
}

const tripOr404 = (id: string) => store.trips.get(id) ?? (() => { throw new HttpError(404, 'Trip not found'); })();
const name = z.string().trim().min(1).max(60);

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const [, a, b, c, d, e] = parts;
  const send = (data: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  const is = (method: string, n: number) => req.method === method && parts.length === n;

  // Health check and PayPal's webhook (verified by signature) stay open; everything else needs the token when one is set.
  const open = a === 'config' || (a === 'paypal' && b === 'webhook');
  if (ACCESS_TOKEN && !open && !safeEqual(String(req.headers['x-access-token'] ?? ''), ACCESS_TOKEN)) throw new HttpError(401, 'Missing or wrong access token.');

  if (a === 'config' && is('GET', 2))
    return send({ paypalClientId: ext.ready.paypal ? process.env.PAYPAL_CLIENT_ID : null, ready: ext.ready });

  if (a === 'trips' && is('GET', 2))
    return send([...store.trips.values()].map((t) => ({ id: t.id, name: t.name, phase: t.phase, members: t.members, destinations: t.destinations, window: t.window })));

  if (a === 'trips' && is('POST', 2)) {
    const i = await body(req, z.object({ name, currency: z.enum(['USD', 'EUR', 'GBP']), members: z.array(name).min(1).max(8) }));
    return send(store.createTrip(i.name, i.currency, i.members), 201);
  }

  if (a === 'trips' && b) {
    const t = tripOr404(b);
    if (is('GET', 3)) return send(t);
    const m = member(req, t);

    if (c === 'messages' && is('POST', 4)) {
      const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(2000) }));
      store.say(t, m, text);
      persist();
      send(t);
      if (!ext.ready.claude || (await shouldReply(t, text).catch(() => /wayfinder/i.test(text)))) wayfinder(t, `${t.members[m].name} said: ${text}`);
      return;
    }
    if (c === 'confirm' && is('POST', 4)) {
      const ev = store.confirm(t, m);
      persist();
      wayfinder(t, ev);
      return send(t);
    }
    if (c === 'legs' && is('POST', 4)) {
      const { nights } = await body(req, z.object({ nights: z.record(z.string(), z.number().int().min(1).max(60)) }));
      wayfinder(t, store.editNights(t, nights));
      persist();
      return send(t);
    }
    if (c === 'polls' && d) {
      if (e === 'vote' && is('POST', 6)) {
        const { option_id } = await body(req, z.object({ option_id: z.string().nullable() }));
        wayfinder(t, store.vote(t, d, option_id, m));
      } else if (e === 'options' && is('POST', 6)) {
        const { name: n } = await body(req, z.object({ name: z.string().trim().min(2).max(120) }));
        wayfinder(t, store.addOption(t, d, m, n));
      } else if (e === 'close' && is('POST', 6)) wayfinder(t, store.closePoll(t, d));
      else throw new HttpError(404, 'Not found');
      persist();
      return send(t);
    }
    if (c === 'previews' && d) {
      if (e === 'ratio' && is('POST', 6)) {
        const { bp } = await body(req, z.object({ bp: z.number().int().min(0).max(10000) }));
        wayfinder(t, store.setRatio(t, d, m, bp));
      } else if (e === 'equal' && is('POST', 6)) store.resetEqual(t, d, m);
      else if (e === 'accept' && is('POST', 6)) {
        if (store.accept(t, d, m)) await sendOrders(t, d);
      } else if (e === 'capture' && is('POST', 6)) {
        const p = t.previews.find((x) => x.id === d);
        const share = p?.shares[m];
        if (!share?.order_id) throw new HttpError(400, 'No payment request for you on this bill.');
        await ext.captureOrder(share.order_id); // status changes only when PayPal's webhook arrives
        return send({ ok: true });
      } else throw new HttpError(404, 'Not found');
      persist();
      return send(t);
    }
    if (c === 'txns' && is('POST', 4)) {
      const i = await body(req, z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), vendor: name, type: name,
        total: z.number().int().positive().max(100_000_00), bps: z.array(z.number().int().min(0).max(10000)),
      }));
      const rows = store.logExpense(t, m, i);
      persist();
      reindex(t, rows);
      return send(t);
    }
    if (c === 'search' && is('GET', 4)) {
      const q = url.searchParams.get('q') ?? '';
      const ids = await ext.searchTxnIds(t.id, q).catch((err) => (console.error('Elastic search failed:', err.message), null));
      return send({ engine: ids ? 'elasticsearch' : 'local', ids: ids ?? searchTxns(t.txs, t.members, q).map((x) => x.id) });
    }
  }

  if (a === 'products' && is('GET', 2)) {
    const max = Number(url.searchParams.get('max')) || undefined;
    return send(await ext.searchProducts(url.searchParams.get('q') ?? '', max, url.searchParams.get('currency') ?? 'USD'));
  }
  if (a === 'checkout' && is('POST', 2)) {
    const { url: target } = await body(req, z.object({ url: z.string().url().refine((u) => u.startsWith('https://'), 'https only') }));
    return send(await ext.openCheckout(target));
  }
  if (a === 'checkout' && b && is('DELETE', 3)) return send((await ext.closeCheckout(b), { ok: true }));

  if (a === 'paypal' && b === 'webhook' && is('POST', 3)) {
    const event = await body(req, z.object({ id: z.string(), event_type: z.string(), resource: z.record(z.string(), z.any()) }).passthrough());
    if (!(await ext.verifyWebhook(req.headers, event))) throw new HttpError(400, 'Bad signature');
    if (seenEvents.has(event.id)) return send({ ok: true, duplicate: true });
    seenEvents.add(event.id);
    const r = event.resource as { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
    const orderId = r.supplementary_data?.related_ids?.order_id ?? r.id;
    const status = ({ 'CHECKOUT.ORDER.APPROVED': 'approved', 'PAYMENT.CAPTURE.COMPLETED': 'captured', 'PAYMENT.CAPTURE.DENIED': 'failed', 'PAYMENT.CAPTURE.DECLINED': 'failed' } as const)[event.event_type as 'CHECKOUT.ORDER.APPROVED'];
    const hit = status && orderId ? store.paymentStatus(orderId, status) : null;
    if (hit) {
      persist();
      reindex(hit.trip, [hit.row]);
      wayfinder(hit.trip, hit.event);
    }
    return send({ ok: true });
  }

  throw new HttpError(404, 'Not found');
}

/** Everyone accepted: one PayPal order per member, then freeze the preview. */
async function sendOrders(t: Trip, previewId: string) {
  const p = t.previews.find((x) => x.id === previewId)!;
  const cents = shareAmounts(p)!;
  const ids = await Promise.all(p.shares.map((s, i) => ext.createOrder({
    requestId: `${p.id}-${s.ratio_bp}-${i}`, customId: `${t.id}:${p.id}:${i}`, cents: cents[i], currency: p.currency,
    description: `${t.name} · ${p.title} · ${t.members[i].name}'s share`,
  })));
  const rows = store.ordersCreated(t, p, ids);
  reindex(t, rows);
  store.say(t, 'ai', 'Each of you has a payment request for your share — tap Pay my share.');
}

createServer((req, res) => {
  route(req, res).catch((err) => {
    const status = err instanceof HttpError ? err.status : err instanceof store.Rejected ? 409 : err instanceof ext.NotConfigured ? 503 : err instanceof SyntaxError ? 400 : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Server error' : err.message }));
    }
  });
}).listen(PORT, () => console.log(`PayTogether API on port ${PORT} · token ${ACCESS_TOKEN ? 'required' : 'off'} · ready:`, ext.ready));
