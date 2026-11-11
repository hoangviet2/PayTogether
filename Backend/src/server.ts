// PayTogether API on node:http, API only. The web app is deployed on its own and calls this server cross-origin
// (VITE_API_URL), or through Vite's /api proxy in dev (FrontEnd/web/vite.config.ts).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { mySummary, searchTxns, shareAmounts, type Preview, type Trip, type Txn } from '../../FrontEnd/shared/trip.ts';
import * as store from './store.ts';
import * as ext from './integrations.ts';
import { runTool, runTurn, shouldReply, turnContext } from './wayfinder.ts';
import * as workflows from './workflows.ts';

const PORT = Number(process.env.PORT ?? 8787);
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // set on any public host; the web dev proxy sends it (FrontEnd/web/vite.config.ts)
// The web app's origin(s), comma-separated, e.g. https://paytogether-web.onrender.com. Unset: no cross-origin access.
const WEB_ORIGINS = (process.env.WEB_ORIGIN ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
const seenEvents = new Set<string>(); // shortcut: in-memory webhook dedupe; persist it with the store when moving to Postgres

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const persist = () => store.save();
const reindex = (t: Trip, rows: Txn[]) => {
  if (!ext.ready.elastic || !rows.length) return;
  const people = t.members.map(({ name }) => ({ name })); // names only: workflow inputs are stored by Render for 30 days
  if (workflows.enabled) return void workflows.start('index-txns', [t.id, rows, people]).catch((e) => console.error('index-txns start failed:', e.message));
  rows.forEach((r) => ext.indexTxn(t.id, r, people).catch((e) => console.error('Elastic index failed:', e.message)));
};
const OFFLINE = 'I am offline: set OPENAI_API_KEY in Backend/.env and restart the server.';
const wayfinder = (t: Trip, trigger: string | null) => {
  if (!trigger) return;
  if (!ext.ready.ai) {
    if (!t.chat.some((c) => c.text === OFFLINE)) store.say(t, 'ai', OFFLINE); // once per trip, not after every message
    return persist();
  }
  runTurn(t, trigger, persist);
};

async function rawBody(req: IncomingMessage) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, 'Body too large');
  }
  return raw;
}
function check<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(raw ? JSON.parse(raw) : {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return parsed.data;
}
const body = async <T,>(req: IncomingMessage, schema: z.ZodType<T>) => check(await rawBody(req), schema);

/** Who is calling: the signed session from Log in with PayPal (x-session header). */
function session(req: IncomingMessage) {
  const s = ext.readSession(String(req.headers['x-session'] ?? ''));
  if (!s) throw new HttpError(401, 'Log in with PayPal first.');
  return s;
}

/** The caller's seat in this trip; only members can read or change it. */
function member(req: IncomingMessage, t: Trip) {
  const m = store.memberOf(t, session(req).user);
  if (m < 0) throw new HttpError(403, 'You are not in this trip. Ask a member for its join code.');
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

  // Health check, login and PayPal's webhook (verified by signature) stay open. Everything else needs the access token
  // (dev proxy) or a Log in with PayPal session (the hosted web app, which cannot hold a secret).
  const open = a === 'config' || (a === 'paypal' && b === 'webhook') || (a === 'auth' && b === 'paypal');
  const allowed = open || !ACCESS_TOKEN || safeEqual(String(req.headers['x-access-token'] ?? ''), ACCESS_TOKEN) || !!ext.readSession(String(req.headers['x-session'] ?? ''));
  if (!allowed) throw new HttpError(401, 'Log in with PayPal first.');

  if (a === 'config' && is('GET', 2))
    return send({ paypalClientId: ext.ready.paypal ? process.env.PAYPAL_CLIENT_ID : null, paypalLogin: ext.loginUrl(), ready: ext.ready });

  if (a === 'auth' && b === 'paypal' && is('POST', 3)) {
    const { code } = await body(req, z.object({ code: z.string().min(1).max(2000) }));
    const { email, ...u } = await ext.paypalUser(code).catch((e) => { throw e instanceof ext.NotConfigured ? e : new HttpError(401, e.message); });
    store.remember(u.user, u.name, email);
    persist();
    return send({ session: ext.newSession(u), ...u });
  }

  if (a === 'join' && is('POST', 2)) {
    const u = session(req);
    const { code } = await body(req, z.object({ code: z.string().trim().min(1).max(12) }));
    const t = store.byCode(code) ?? (() => { throw new HttpError(404, 'No trip has that code. Check it with whoever sent it.'); })();
    store.join(t, u.name, u.user);
    persist();
    return send(t);
  }

  if (a === 'trips' && is('GET', 2)) {
    const { user } = session(req);
    return send([...store.trips.values()].flatMap((t) => {
      const m = store.memberOf(t, user);
      return m < 0 ? [] : [{ id: t.id, name: t.name, phase: t.phase, currency: t.currency, solo: !!t.solo, members: t.members, destinations: t.destinations, window: t.window, mine: mySummary(t, m) }];
    }));
  }

  if (a === 'trips' && is('POST', 2)) {
    const u = session(req);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const i = await body(req, z.object({ name, currency: z.enum(['USD', 'EUR', 'GBP']), solo: z.boolean().default(false), start: date.optional(), end: date.optional() }));
    if (!i.start !== !i.end) throw new HttpError(400, 'Give both a start and an end date, or neither.');
    const window = i.start && i.end ? { start: i.start, end: i.end } : null;
    return send(store.createTrip(i.name, i.currency, [u.name], u.user, { solo: i.solo, window }), 201); // friends join with the trip's code
  }

  // Callbacks from the paytogether-workflows service (src/tasks.ts). Need the access token itself: a user session is not enough.
  if (a === 'internal') {
    if (!ACCESS_TOKEN || !safeEqual(String(req.headers['x-access-token'] ?? ''), ACCESS_TOKEN)) throw new HttpError(403, 'Internal route');
    const t = b === 'trips' && c ? tripOr404(c) : null;
    if (t && d === 'context' && is('POST', 5)) {
      const { trigger } = await body(req, z.object({ trigger: z.string().max(5000) }));
      return send(turnContext(t, trigger));
    }
    if (t && d === 'tool' && is('POST', 5)) {
      const { name: tool, args } = await body(req, z.object({ name: z.string().max(100), args: z.string().max(50_000) }));
      const output = await runTool(t, tool, args);
      persist();
      return send({ output });
    }
    throw new HttpError(404, 'Not found');
  }

  if (a === 'invites' && is('GET', 2)) {
    const { user } = session(req);
    return send(store.invitesFor(user).map((t) => ({ id: t.id, name: t.name, by: t.members[0].name, members: t.members.length })));
  }

  if (a === 'trips' && b && (c === 'accept' || c === 'decline') && is('POST', 4)) {
    const u = session(req);
    const t = tripOr404(b);
    if (!t.invites?.some((i) => i.user === u.user)) throw new HttpError(403, 'You have no invite to this trip.');
    if (c === 'accept') store.join(t, u.name, u.user);
    else t.invites = t.invites.filter((i) => i.user !== u.user);
    persist();
    return send(c === 'accept' ? t : { ok: true });
  }

  if (a === 'trips' && b) {
    const t = tripOr404(b);
    const m = member(req, t);
    if (is('GET', 3)) return send(t);
    if (c === 'leave' && is('POST', 4)) {
      store.leave(t, m);
      persist();
      return send({ ok: true });
    }
    if (c === 'purchases' && is('POST', 4)) {
      const i = await body(req, z.object({ title: z.string().trim().min(1).max(120), url: z.string().url().refine((u) => u.startsWith('https://'), 'https only'), cents: z.number().int().positive().max(100_000_00) }));
      const p = store.createPurchase(t, m, i); // goes to Split bills
      await settleIfReady(t, p.id); // a solo trip has nobody else to wait for
      persist();
      return send(t);
    }
    if (is('DELETE', 3)) {
      store.deleteTrip(t, m);
      persist(); // rewrites the trips file on the disk without this trip
      ext.deleteTripDocs(t.id).catch((e) => console.error('Elastic cleanup failed:', e.message));
      return send({ ok: true });
    }

    if (c === 'invite' && is('POST', 4)) {
      const { email } = await body(req, z.object({ email: z.string().trim().email().max(254) }));
      const who = store.invite(t, email);
      store.say(t, 'ai', `${t.members[m].name} invited ${who}. They'll join once they accept.`);
      persist();
      return send(t);
    }

    if (c === 'messages' && is('POST', 4)) {
      const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(2000) }));
      store.say(t, m, text);
      persist();
      send(t);
      if (!ext.ready.ai || (await shouldReply(t, text).catch(() => /wayfinder/i.test(text)))) wayfinder(t, `${t.members[m].name} said: ${text}`);
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
      store.editNights(t, nights); // no Wayfinder turn: these edits are valid by construction, and each click would queue one
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
        await settleIfReady(t, d);
      } else if (e === 'equal' && is('POST', 6)) store.resetEqual(t, d, m);
      else if ((e === 'split-again' || e === 'delete') && is('POST', 6)) {
        const r = e === 'delete' ? store.voteDelete(t, m, d) : { deleted: false, ids: store.splitAgain(t, m, d) };
        ext.deleteTxnDocs(t.id, r.ids).catch((err) => console.error('Elastic cleanup failed:', err.message));
      }
      else if (e === 'accept' && is('POST', 6)) {
        store.accept(t, d, m);
        await settleIfReady(t, d);
      } else if (e === 'pay' && is('POST', 6)) {
        // Called each time someone opens PayPal: bills can sit for days and PayPal drops unapproved orders, so swap in a fresh one.
        const p = t.previews.find((x) => x.id === d);
        const share = p?.shares[m];
        if (!p || !share?.order_id) throw new HttpError(400, 'No payment request for you on this bill.');
        if (share.status === 'captured') throw new HttpError(409, 'You already paid this.');
        const st = await ext.orderStatus(share.order_id);
        if (st === 'APPROVED') {
          const r = captureResult(await ext.captureOrder(share.order_id));
          if (r) applyStatus(share.order_id, r);
          return send({ orderId: share.order_id, approved: true });
        }
        if (st === 'COMPLETED') { // PayPal took it but its webhook never reached us: record it now
          applyStatus(share.order_id, 'captured');
          return send({ orderId: share.order_id, approved: true });
        }
        if (!st || st === 'VOIDED') {
          share.order_id = await ext.createOrder({
            requestId: `${p.id}-${m}-${Date.now()}`, customId: `${t.id}:${p.id}:${m}`, cents: shareAmounts(p)![m], currency: p.currency,
            description: `${t.name} · ${p.title} · ${t.members[m].name}'s share`, ...(p.payee && { payee: p.payee.email }),
          });
          share.status = 'created';
          const row = t.txs.find((x) => x.id === `${p.id}-${m}`);
          if (row) row.status = 'created';
          persist();
        }
        return send({ orderId: share.order_id, approved: false });
      } else if (e === 'capture' && is('POST', 6)) {
        const p = t.previews.find((x) => x.id === d);
        const share = p?.shares[m];
        if (!share?.order_id) throw new HttpError(400, 'No payment request for you on this bill.');
        // PayPal's capture response is authoritative (server to server), so a missing webhook can't leave it unpaid.
        const r = captureResult(await ext.captureOrder(share.order_id));
        if (r) applyStatus(share.order_id, r);
        return send({ ok: true });
      } else throw new HttpError(404, 'Not found');
      persist();
      return send(t);
    }
    if (c === 'store-pay' && is('POST', 4)) {
      const i = await body(req, z.object({
        vendor: name, contact: z.string().trim().min(3).max(254), total: z.number().int().positive().max(100_000_00),
        category: z.enum(['Restaurant', 'Store', 'Transport', 'Tickets', 'Other']), bps: z.array(z.number().int().min(0).max(10000)).max(20),
      }));
      // An email pays the vendor's PayPal directly; a phone number goes to PayTogether, then a Payout to that phone.
      const email = i.contact.includes('@') ? z.string().email().safeParse(i.contact).data : undefined;
      const phone = email ? undefined : /^\+?[\d\s().-]{7,20}$/.test(i.contact) ? i.contact.replace(/[^\d+]/g, '') : undefined;
      if (!email && !phone) throw new HttpError(400, 'Enter the vendor’s PayPal email or phone number.');
      const p = store.createStorePay(t, m, { ...i, email, phone });
      try { await sendOrders(t, p.id, false); } catch (e) { store.dropPreview(t, p.id); throw e; }
      persist();
      return send({ trip: t, previewId: p.id });
    }
    if (c === 'store-bills' && is('POST', 4)) {
      const i = await body(req, z.object({
        vendor: name, email: z.string().trim().email().max(254), total: z.number().int().positive().max(100_000_00),
        category: z.enum(['Restaurant', 'Store', 'Transport', 'Tickets', 'Other']), members: z.array(z.number().int().min(0)).max(20),
        bps: z.array(z.number().int().min(0).max(10000)).max(20).optional(),
      }));
      const p = store.createStoreBill(t, m, i);
      persist();
      return send(t);
    }
    if (c === 'txns' && is('POST', 4)) {
      const i = await body(req, z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), vendor: name, type: name,
        total: z.number().int().positive().max(100_000_00), bps: z.array(z.number().int().min(0).max(10000)).optional(), paid: z.boolean().default(true), store: z.boolean().default(false), only_me: z.boolean().default(false),
      }));
      if (i.only_me && i.paid) { // Only me, already paid: no split, straight to the Spending list
        const rows = store.logExpense(t, m, { ...i, bps: t.members.map((_, k) => (k === m ? 10000 : 0)) });
        persist();
        reindex(t, rows);
        return send(t);
      }
      if (!i.store) { // Log expense: a bill in Split bills, where each member sets their share (Only me + planned: 100% theirs, straight to Payments due)
        const p = store.createLoggedBill(t, m, i, i.only_me);
        await settleIfReady(t, p.id); // a solo trip has nobody else to wait for
        persist();
        return send(t);
      }
      if (!i.bps) throw new HttpError(400, 'bps: Required');
      const rows = store.logExpense(t, m, { ...i, bps: i.bps }); // Paid at a store: already split, straight to the transactions
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
    const q = url.searchParams.get('q') ?? '', currency = url.searchParams.get('currency') ?? 'USD';
    return send(await workflows.offload(ext.ready.channel3, 'search-products', [q, max ?? null, currency], () => ext.searchProducts(q, max, currency)));
  }
  if (a === 'checkout' && is('POST', 2)) {
    const { url: target } = await body(req, z.object({ url: z.string().url().refine((u) => u.startsWith('https://'), 'https only') }));
    return send(await workflows.offload(ext.ready.kernel, 'open-checkout', [target], () => ext.openCheckout(target)));
  }
  if (a === 'checkout' && b && is('DELETE', 3))
    return send((await workflows.offload(ext.ready.kernel, 'close-checkout', [b], () => ext.closeCheckout(b).then(() => true)), { ok: true }));

  if (a === 'paypal' && b === 'webhook' && is('POST', 3)) {
    const raw = await rawBody(req);
    const event = check(raw, z.object({ id: z.string(), event_type: z.string(), resource: z.record(z.string(), z.any()) }).passthrough());
    // Verify the bytes PayPal sent: the parsed object has its keys reordered, which fails the signature check.
    if (!(await ext.verifyWebhook(req.headers, raw))) {
      console.error(`PayPal webhook ${event.id} (${event.event_type}) failed signature verification. Check PAYPAL_WEBHOOK_ID and that it belongs to this app.`);
      throw new HttpError(400, 'Bad signature');
    }
    if (seenEvents.has(event.id)) return send({ ok: true, duplicate: true });
    seenEvents.add(event.id);
    const r = event.resource as { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
    const orderId = r.supplementary_data?.related_ids?.order_id ?? r.id;
    const status = ({ 'CHECKOUT.ORDER.APPROVED': 'approved', 'PAYMENT.CAPTURE.COMPLETED': 'captured', 'PAYMENT.CAPTURE.DENIED': 'failed', 'PAYMENT.CAPTURE.DECLINED': 'failed' } as const)[event.event_type as 'CHECKOUT.ORDER.APPROVED'];
    if (status && orderId) applyStatus(orderId, status);
    return send({ ok: true });
  }

  throw new HttpError(404, 'Not found');
}

/** Records a payment status that came from PayPal itself: a verified webhook, or our own server-to-server call
 * (capture response, order lookup). Never from the browser. Idempotent: a capture is never downgraded. */
function applyStatus(orderId: string, status: 'approved' | 'captured' | 'failed') {
  const hit = store.paymentStatus(orderId, status);
  if (!hit) return;
  const p = hit.trip.previews.find((x) => x.shares.some((s) => s.order_id === orderId));
  let rows = [hit.row];
  if (status === 'captured' && p?.split_bps) { // Pay at a store: straight to the transactions, split as entered
    rows = store.finishStorePay(hit.trip, p);
    if (p.payout_phone) forwardPayout(hit.trip, p);
  }
  persist();
  reindex(hit.trip, rows);
  wayfinder(hit.trip, hit.event);
}

/** Forwards a captured phone-vendor payment. Recorded on the trip before and after, so money PayTogether holds is never
 * untracked; a failure is told to the group. shortcut: final payout status (webhooks PAYMENT.PAYOUTS-ITEM.*) isn't tracked. */
function forwardPayout(t: Trip, p: Preview) {
  const rec = { id: p.id, vendor: p.title, phone: p.payout_phone!, cents: p.total_cents, status: 'sending' as 'sending' | 'sent' | 'failed', error: undefined as string | undefined };
  (t.payouts ??= []).push(rec);
  ext.sendPayout({ batchId: p.id, phone: rec.phone, cents: rec.cents, currency: p.currency, note: `${t.name} · ${p.title}` })
    .then(() => { rec.status = 'sent'; })
    .catch((e) => {
      Object.assign(rec, { status: 'failed', error: e.message });
      console.error(`Payout ${p.id} to ${rec.phone} failed:`, e.message);
      store.say(t, 'ai', `The payment to ${p.title} reached PayTogether, but forwarding it to their phone failed. It needs a retry or a refund; the trip owner should contact support.`);
    })
    .finally(persist);
}
/** Status of a capture response from PayPal's API. */
const captureResult = (d: Record<string, any>) => {
  const c = d.purchase_units?.[0]?.payments?.captures?.[0]?.status ?? d.status;
  return c === 'COMPLETED' ? 'captured' : c === 'DECLINED' || c === 'FAILED' ? 'failed' : null; // PENDING waits for the webhook
};

/** Everyone on a bill accepted: PayPal requests go out, or a paid logged expense becomes transactions. */
async function settleIfReady(t: Trip, previewId: string) {
  const p = t.previews.find((x) => x.id === previewId);
  if (!p) return;
  if (store.readyToCharge(p)) return sendOrders(t, previewId);
  const rows = store.recordPaidBill(t, previewId);
  if (rows) reindex(t, rows);
}

/** Everyone accepted: one PayPal order per member, then freeze the preview. */
async function sendOrders(t: Trip, previewId: string, announce = true) {
  const p = t.previews.find((x) => x.id === previewId)!;
  const cents = shareAmounts(p)!;
  const payers = p.shares.flatMap((s, i) => (s.ratio_bp ? [i] : [])); // 0% shares get no order
  const orders = payers.map((i) => ({
    requestId: `${p.id}-${p.shares[i].ratio_bp}-${i}`, customId: `${t.id}:${p.id}:${i}`, cents: cents[i], currency: p.currency,
    description: `${t.name} · ${p.title} · ${t.members[i].name}'s share`, ...(p.payee && { payee: p.payee.email }),
  }));
  const ids = await workflows.offload(ext.ready.paypal, 'paypal-orders', [orders], () => Promise.all(orders.map(ext.createOrder)));
  const rows = store.ordersCreated(t, p, p.shares.map((_, i) => ids[payers.indexOf(i)] ?? ''));
  reindex(t, rows);
  if (announce) store.say(t, 'ai', `Everyone accepted ${p.title}. Your share is in Payments due on the Spending tab; pay it from there whenever you're ready.`);
}

createServer((req, res) => {
  const origin = String(req.headers.origin ?? '');
  if (WEB_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session, x-access-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (!req.url?.startsWith('/api')) return void res.writeHead(404, { 'Content-Type': 'text/plain' }).end('PayTogether API: routes are under /api');
  route(req, res).catch((err) => {
    const status = err instanceof HttpError ? err.status : err instanceof store.Rejected ? 409 : err instanceof ext.NotConfigured ? 503 : err instanceof SyntaxError ? 400 : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Server error' : err.message }));
    }
  });
}).listen(PORT, () => console.log(`PayTogether API on port ${PORT} · token ${ACCESS_TOKEN ? 'required' : 'off'} · web origins ${WEB_ORIGINS.join(', ') || 'none (dev proxy only)'} · ready:`, ext.ready));
