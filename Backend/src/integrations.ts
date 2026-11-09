// Server-only clients. Keys come from Backend/.env and never reach the browser.
// Each integration is off until its keys are set; routes answer 503 with the missing variable name.
import { Channel3 } from '@channel3/sdk';
import { Kernel } from '@onkernel/sdk';
import { Client as Elastic } from '@elastic/elasticsearch';
import { parseQuery, type Person, type Txn } from '../../FrontEnd/shared/trip.ts';

const env = process.env;
export const ready = {
  claude: !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE),
  paypal: !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
  paypalWebhook: !!env.PAYPAL_WEBHOOK_ID,
  channel3: !!env.CHANNEL3_API_KEY,
  kernel: !!env.KERNEL_API_KEY,
  elastic: !!(env.ELASTIC_URL && env.ELASTIC_API_KEY),
};
export class NotConfigured extends Error {}
const need = (ok: boolean, vars: string) => {
  if (!ok) throw new NotConfigured(`Set ${vars} in Backend/.env`);
};

// ---------- PayPal (Orders v2 + webhooks) ----------
const PP = env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
let token: { value: string; exp: number } | null = null;

async function ppToken() {
  if (token && token.exp > Date.now()) return token.value;
  const r = await fetch(`${PP}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}` },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`PayPal auth failed: ${r.status}`);
  const d = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 };
  return token.value;
}

async function pp(path: string, body: unknown, requestId?: string) {
  const r = await fetch(`${PP}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await ppToken()}`, ...(requestId && { 'PayPal-Request-Id': requestId }) },
    body: JSON.stringify(body),
  });
  const d = (await r.json()) as Record<string, any>;
  if (!r.ok) throw new Error(`PayPal ${path} ${r.status}: ${d.message ?? d.name ?? 'error'}`);
  return d;
}

/** One order per member share. PayPal-Request-Id makes a retry return the same order (invariant 4). */
export async function createOrder(o: { requestId: string; customId: string; cents: number; currency: string; description: string }) {
  need(ready.paypal, 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET');
  const value = (o.cents / 100).toFixed(2); // shortcut: 2-decimal currencies only (USD/EUR/GBP offered in the UI)
  const d = await pp('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ custom_id: o.customId, description: o.description.slice(0, 127), amount: { currency_code: o.currency, value } }],
  }, o.requestId);
  return d.id as string;
}

/** Runs after the payer approved in PayPal. Does not change our status; the webhook does (invariant 3). */
export async function captureOrder(orderId: string) {
  need(ready.paypal, 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET');
  return pp(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`);
}

export async function verifyWebhook(h: Record<string, string | string[] | undefined>, event: unknown) {
  need(ready.paypal && ready.paypalWebhook, 'PAYPAL_WEBHOOK_ID');
  const d = await pp('/v1/notifications/verify-webhook-signature', {
    auth_algo: h['paypal-auth-algo'], cert_url: h['paypal-cert-url'], transmission_id: h['paypal-transmission-id'],
    transmission_sig: h['paypal-transmission-sig'], transmission_time: h['paypal-transmission-time'],
    webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: event,
  });
  return d.verification_status === 'SUCCESS';
}

// ---------- Channel3 product search ----------
const c3 = ready.channel3 ? new Channel3({ apiKey: env.CHANNEL3_API_KEY }) : null;
export type ProductHit = { id: string; title: string; image?: string; offers: { domain: string; url: string; cents: number; currency: string; inStock: boolean }[] };

export async function searchProducts(query: string, maxPrice: number | undefined, currency: string): Promise<ProductHit[]> {
  need(!!c3, 'CHANNEL3_API_KEY');
  const page = await c3!.products.search({
    query, limit: 12,
    filters: maxPrice ? { price: { max_price: maxPrice } } : undefined,
    config: { currency: currency as never },
  });
  return page.data.map((p) => ({
    id: p.id,
    title: p.title,
    image: (p.images?.find((i) => i.is_main_image) ?? p.images?.[0])?.url,
    offers: (p.offers ?? []).map((o) => ({ domain: o.domain, url: o.url, cents: Math.round(o.price.price * 100), currency: o.price.currency, inStock: o.availability === 'InStock' })),
  }));
}

// ---------- Kernel assisted checkout ----------
const kernel = ready.kernel ? new Kernel() : null;

/** Opens the merchant page in a cloud browser and hands back the live view. It only navigates:
 * it never types credentials or payment details and never presses pay (invariant 8). */
export async function openCheckout(url: string) {
  need(!!kernel, 'KERNEL_API_KEY');
  const s = await kernel!.browsers.create({ stealth: true, timeout_seconds: 600 });
  try {
    const r = await kernel!.browsers.playwright.execute(s.session_id, {
      code: `await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded" }); return page.url();`,
      timeout_sec: 60,
    });
    if (!r.success) throw new Error(r.error ?? r.stderr ?? 'Could not open the merchant page');
  } catch (e) {
    await kernel!.browsers.deleteByID(s.session_id);
    throw e;
  }
  return { session_id: s.session_id, live_view_url: s.browser_live_view_url };
}
export async function closeCheckout(sessionId: string) {
  need(!!kernel, 'KERNEL_API_KEY');
  await kernel!.browsers.deleteByID(sessionId);
}

// ---------- Elasticsearch (derived index; only indexTxn writes, invariant 6) ----------
const es = ready.elastic ? new Elastic({ node: env.ELASTIC_URL, auth: { apiKey: env.ELASTIC_API_KEY! } }) : null;
const INDEX = 'paytogether-transactions';
let indexReady: Promise<unknown> | null = null;

const ensureIndex = () =>
  (indexReady ??= es!.indices.exists({ index: INDEX }).then(async (ok) => ok || await es!.indices.create({
    index: INDEX,
    mappings: {
      properties: {
        trip_id: { type: 'keyword' }, member: { type: 'text' }, vendor: { type: 'text' }, type: { type: 'text' }, leg: { type: 'text' },
        source: { type: 'text' }, status: { type: 'text' }, amount_cents: { type: 'long' }, date: { type: 'date' },
      },
    },
  })));

/** The indexer. Only searchable fields go in: no PayPal emails, order ids or notes. */
export async function indexTxn(tripId: string, t: Txn, people: Person[]) {
  if (!es) return;
  await ensureIndex();
  await es.index({
    index: INDEX, id: `${tripId}:${t.id}`,
    document: { trip_id: tripId, member: people[t.member]?.name, vendor: t.vendor, type: t.type, leg: t.leg, source: t.source, status: t.status, amount_cents: t.amount, date: t.date },
  });
}

/** Txn ids matching the query, always filtered to one trip. Null when Elastic isn't configured. */
export async function searchTxnIds(tripId: string, query: string): Promise<string[] | null> {
  if (!es) return null;
  await ensureIndex();
  const { words, range } = parseQuery(query);
  const r = await es.search<{ trip_id: string }>({
    index: INDEX, size: 500,
    query: {
      bool: {
        filter: [{ term: { trip_id: tripId } }, ...range.map((x) => ({ range: { amount_cents: x.op === '>' ? { gt: x.cents } : { lt: x.cents } } }))],
        must: words.map((w) => ({ multi_match: { query: w, type: 'bool_prefix' as const, fields: ['member', 'vendor', 'type', 'leg', 'source', 'status'] } })),
      },
    },
  });
  return r.hits.hits.map((h) => String(h._id).slice(tripId.length + 1));
}
