import { useState, type FormEvent } from 'react';
import { money, type Share, type Trip } from '../../shared/trip';
import { api, type Ctx } from './api';
import { Icon, icons, PayShare } from './ui';

type Hit = { id: string; title: string; image?: string; offers: { domain: string; url: string; cents: number; currency: string; inStock: boolean }[] };
type Paying = { previewId: string; orderId: string; title: string; cents: number };

export function Shop({ ctx }: { ctx: Ctx }) {
  const { trip } = ctx;
  const [q, setQ] = useState('');
  const [max, setMax] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<Paying | null>(null);
  const [opening, setOpening] = useState<string | null>(null); // product whose PayPal order is being created

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setHits(await api<Hit[]>(`/products?q=${encodeURIComponent(q)}&currency=${trip.currency}${Number(max) > 0 ? `&max=${Number(max)}` : ''}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Same flow as Pay in Spending: a PayPal order for the price, then PayPal opens here. It also lands in Payments due.
  const checkout = async (h: Hit) => {
    const offer = h.offers[0];
    setError(null);
    setOpening(h.id);
    try {
      const r = await api<{ trip: Trip; previewId: string }>(`/trips/${trip.id}/purchases`, { body: { title: h.title, url: offer.url, cents: offer.cents } });
      const orderId = r.trip.previews.find((p) => p.id === r.previewId)?.shares[ctx.me].order_id;
      if (orderId) setPaying({ previewId: r.previewId, orderId, title: h.title, cents: offer.cents });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOpening(null);
    }
  };

  return (
    <>
      <section className="card">
        <h2 style={{ fontSize: 20 }}>Shop for the trip</h2>
        <form className="row" style={{ gap: 8, flexWrap: 'wrap' }} onSubmit={search}>
          <label htmlFor="shop-q" className="sr-only">Search products</label>
          <div className="row" style={{ flex: '3 1 240px', gap: 10, border: '1px solid var(--input)', borderRadius: 12, padding: '0 12px', minHeight: 48 }}>
            <Icon d={icons.search} />
            <input id="shop-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Packable rain jacket, travel adapter…" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 15 }} />
          </div>
          <label className="row small" style={{ gap: 6 }}>Max {trip.currency}
            <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" style={{ width: 90, minHeight: 44, border: '1px solid var(--input)', borderRadius: 10, padding: '0 10px' }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        </form>
        <span className="small muted">Results via Channel3. Product data comes from merchants and is shown as-is.</span>
        {error && <p role="alert" className="small" style={{ color: 'var(--orange-ink)' }}>{error}</p>}
        <div className="grid-auto">
          {hits?.map((h) => {
            const best = [...h.offers].sort((a, b) => a.cents - b.cents)[0];
            return (
              <div key={h.id} className="col" style={{ gap: 10, border: '1px solid var(--line)', borderRadius: 14, padding: 12 }}>
                {h.image ? <img src={h.image} alt="" style={{ height: 140, objectFit: 'contain', borderRadius: 10, background: '#fff' }} /> : <div className="photo" aria-hidden="true" />}
                <strong style={{ fontSize: 15 }}>{h.title}</strong>
                {best && <span className="mono">{money(best.cents, best.currency)}</span>}
                <span className="small muted">{h.offers.length} offer{h.offers.length === 1 ? '' : 's'}{best ? ` · ${best.domain}` : ''}</span>
                {best && (
                  <div className="row" style={{ gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                    <a className="btn btn-outline" href={best.url} target="_blank" rel="noreferrer noopener">Open merchant</a>
                    <button type="button" className="btn btn-primary" disabled={opening === h.id || best.currency !== trip.currency}
                      title={best.currency !== trip.currency ? `Priced in ${best.currency}; this trip pays in ${trip.currency}` : undefined}
                      onClick={() => checkout({ ...h, offers: [best] })}>{opening === h.id ? 'Starting PayPal…' : 'Checkout with PayPal'}</button>
                  </div>
                )}
              </div>
            );
          })}
          {hits?.length === 0 && <p className="muted">No products match. Try another search or raise the max price.</p>}
        </div>
      </section>

      <Orders ctx={ctx} />

      {paying && (
        <section className="card" aria-labelledby="pp-h">
          <div className="between" style={{ alignItems: 'center' }}>
            <div className="col">
              <span className="eyebrow">Checkout with PayPal</span>
              <h2 id="pp-h" style={{ fontSize: 18 }}>{paying.title} · {money(paying.cents, trip.currency)}</h2>
            </div>
            <button type="button" className="btn" onClick={() => setPaying(null)}>Close</button>
          </div>
          <PayShare key={paying.orderId} ctx={ctx} previewId={paying.previewId} orderId={paying.orderId} currency={trip.currency} autoOpen label={`Pay ${money(paying.cents, trip.currency)}`} />
          <p className="small muted">It’s also in Payments due on the Spending tab, so you can pay it later from there.</p>
        </section>
      )}
    </>
  );
}

const ORDER_STATUS: Record<Share['status'], [string, string]> = {
  none: ['Not paid', 'pill-gray'], created: ['Awaiting payment', 'pill-orange'], approved: ['Verifying', 'pill-gray'], captured: ['Paid', 'pill-blue'], failed: ['Payment failed', 'pill-orange'],
};

/** Order summary of everything the group bought online, laid out like a store's checkout summary. */
function Orders({ ctx }: { ctx: Ctx }) {
  const { trip, me } = ctx;
  const items = trip.previews.filter((p) => p.kind === 'shop').map((p) => {
    const buyer = p.shares.findIndex((s) => s.ratio_bp === 10000);
    return { p, buyer, status: p.shares[buyer]?.status ?? 'none', store: p.meta.split(' · ')[1] ?? '' };
  });
  if (!items.length) return null;
  const sum = (f: (s: Share['status']) => boolean) => items.filter((i) => f(i.status)).reduce((a, i) => a + i.p.total_cents, 0);
  return (
    <section className="card" aria-labelledby="orders-h" style={{ maxWidth: 560 }}>
      <div className="between" style={{ alignItems: 'baseline' }}>
        <h2 id="orders-h" style={{ fontSize: 18 }}>Bought online</h2>
        <span className="small muted">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="col" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 0 }}>
        {items.map(({ p, buyer, status, store }) => {
          const m = trip.members[buyer];
          const [label, pill] = ORDER_STATUS[status];
          return (
            <li key={p.id} className="between" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-2)', alignItems: 'flex-start' }}>
              <div className="col" style={{ gap: 3, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{p.title}</span>
                <span className="small muted">{store}{m && <> · <span style={{ color: m.color }}>{m.symbol}</span> {m.name}{buyer === me ? ' (you)' : ''}</>}</span>
                <span className={`pill ${pill}`} style={{ fontSize: 11, alignSelf: 'flex-start' }}>{label}</span>
              </div>
              <span className="mono" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{money(p.total_cents, p.currency)}</span>
            </li>
          );
        })}
      </ul>
      <dl className="col" style={{ gap: 6, margin: 0 }}>
        <div className="between small"><dt className="muted">Paid</dt><dd className="mono" style={{ margin: 0 }}>{money(sum((s) => s === 'captured'), trip.currency)}</dd></div>
        <div className="between small"><dt className="muted">Not paid yet</dt><dd className="mono" style={{ margin: 0 }}>{money(sum((s) => s !== 'captured'), trip.currency)}</dd></div>
        <div className="between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, fontWeight: 600 }}><dt>Total</dt><dd className="mono" style={{ margin: 0 }}>{money(sum(() => true), trip.currency)}</dd></div>
      </dl>
      <span className="small muted">Unpaid items can be paid from Payments due on the Spending tab.</span>
    </section>
  );
}
