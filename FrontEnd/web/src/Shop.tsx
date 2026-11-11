import { useState, type FormEvent } from 'react';
import { money } from '../../shared/trip';
import { api, type Ctx } from './api';
import { Icon, icons } from './ui';

type Hit = { id: string; title: string; image?: string; offers: { domain: string; url: string; cents: number; currency: string; inStock: boolean }[] };

export function Shop({ ctx }: { ctx: Ctx }) {
  const { trip } = ctx;
  const [q, setQ] = useState('');
  const [max, setMax] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null); // product being turned into a split bill

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

  // The item becomes a split bill (equal to start) at the top of Spending; once everyone accepts, each pays with PayPal.
  const toSplit = async (h: Hit) => {
    const offer = h.offers[0];
    setOpening(h.id);
    await ctx.act('/purchases', { title: h.title, url: offer.url, cents: offer.cents }); // errors show in the page banner
    setOpening(null);
    setTimeout(() => document.getElementById('split-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); // after the new bill renders
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
        <span className="small muted">Pick an item and it opens in Split bills at the top of this page, split equally to start. Results via Channel3. Product data comes from merchants and is shown as-is.</span>
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
                      onClick={() => toSplit({ ...h, offers: [best] })}>{opening === h.id ? 'Adding…' : 'Go to split bill'}</button>
                  </div>
                )}
              </div>
            );
          })}
          {hits?.length === 0 && <p className="muted">No products match. Try another search or raise the max price.</p>}
        </div>
      </section>

    </>
  );
}
