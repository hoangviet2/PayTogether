import { useState } from 'react';
import { eur, products } from '../../shared/trip';
import { Icon, icons } from './ui';

const STEPS = ['Opened merchant page', 'Added to cart · size M', 'Reached checkout', 'Your turn: log in and approve in PayPal', 'Read confirmation and record purchase'];

// shortcut: filters the sample catalog locally; Channel3 search + Kernel sessions need the Backend (secrets stay server-side).
export function Shop() {
  const [q, setQ] = useState('rain jacket');
  const [under80, setUnder80] = useState(true);
  const [paypalOnly, setPaypalOnly] = useState(false);
  const [picked, setPicked] = useState('p2');
  const words = q.toLowerCase().split(/\s+/).filter((w) => w && !['jacket', 'jackets'].includes(w));
  const list = products.filter((p) => words.every((w) => p.title.toLowerCase().includes(w) || p.offers.toLowerCase().includes(w)) && (!under80 || p.price < 8000) && (!paypalOnly || p.paypal));
  const sel = products.find((p) => p.id === picked) ?? products[1];

  return (
    <>
      <section className="card">
        <h2 style={{ fontSize: 20 }}>Shop for the trip</h2>
        <form className="row" style={{ gap: 8 }} onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="shop-q" className="sr-only">Search products</label>
          <div className="row" style={{ flex: 1, gap: 10, border: '1px solid var(--input)', borderRadius: 12, padding: '0 12px', minHeight: 48 }}>
            <Icon d={icons.search} />
            <input id="shop-q" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 15 }} />
          </div>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className={`btn ${under80 ? 'btn-on' : ''}`} aria-pressed={under80} onClick={() => setUnder80(!under80)}>Under €80</button>
          <button type="button" className={`btn ${paypalOnly ? 'btn-on' : ''}`} aria-pressed={paypalOnly} onClick={() => setPaypalOnly(!paypalOnly)}>PayPal checkout</button>
          <span className="small muted" style={{ marginLeft: 'auto' }}>Results via Channel3</span>
        </div>
        <div className="grid-auto">
          {list.map((p) => (
            <div key={p.id} className="col" style={{ gap: 10, border: picked === p.id ? '2px solid var(--brand)' : '1px solid var(--line)', borderRadius: 14, padding: 12 }}>
              <div role="img" aria-label={`Product image placeholder: ${p.title}`} className="photo"><span>[product image]</span></div>
              <strong style={{ fontSize: 15 }}>{p.title}</strong>
              <span className="mono">{eur(p.price)}</span>
              <span className="small muted">{p.offers}</span>
              <span className="small" style={{ color: p.paypal ? 'var(--brand)' : 'var(--orange-ink)' }}>{p.paypal ? 'Pays with PayPal on merchant site' : 'Assisted checkout available'}</span>
              {p.paypal ? (
                <a className="btn btn-outline" href={`https://${p.merchant}`} target="_blank" rel="noreferrer noopener" style={{ marginTop: 'auto' }}>Open merchant</a>
              ) : (
                <button type="button" className={`btn ${picked === p.id ? 'btn-on' : 'btn-outline'}`} style={{ marginTop: 'auto' }} aria-pressed={picked === p.id} onClick={() => setPicked(p.id)}>
                  {picked === p.id ? 'In session' : 'Assisted checkout'}
                </button>
              )}
            </div>
          ))}
          {list.length === 0 && <p className="muted">No products match. Try another search or clear a filter.</p>}
        </div>
      </section>

      <section className="card" aria-labelledby="ac-h">
        <div className="between" style={{ alignItems: 'center' }}>
          <div className="col">
            <span className="eyebrow">Assisted checkout</span>
            <h2 id="ac-h" style={{ fontSize: 18 }}>{sel.title} · {eur(sel.price)}</h2>
          </div>
          <span className="mono pill pill-orange">08:42 left</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ flex: '2 1 320px', minHeight: 220, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="mono small muted" style={{ padding: '8px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>{sel.merchant}/checkout</div>
            <div className="photo" style={{ flex: 1, height: 'auto', borderRadius: 0, alignItems: 'center', justifyContent: 'center' }}><span>[Kernel live view]</span></div>
          </div>
          <ol className="col" style={{ flex: '1 1 240px', margin: 0, paddingLeft: 20, gap: 10, fontSize: 14 }}>
            {STEPS.map((s, k) => <li key={s} style={{ fontWeight: k === 3 ? 700 : 400, color: k > 3 ? 'var(--muted)' : undefined }}>{s}</li>)}
          </ol>
        </div>
        <p className="small" style={{ color: 'var(--body)', background: 'var(--gray-tint)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
          The assistant never types passwords or card numbers and never presses the final Pay button. Replays are kept only if you allow it.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label className="row small" style={{ gap: 6, minHeight: 44, marginRight: 'auto' }}><input type="checkbox" />Shared purchase — split with the group</label>
          <button type="button" className="btn btn-primary">Take over in live view</button>
          <button type="button" className="btn">End session</button>
        </div>
      </section>
    </>
  );
}
