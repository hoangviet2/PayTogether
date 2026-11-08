import { members, eur, pct, billAmounts, initialBills, summarize, initialTxs } from '../../shared/trip';
import { Chip, Icon, icons, Logo } from './ui';

const stay = initialBills[1];
const brand = (
  <span className="row" style={{ gap: 10 }}>
    <Logo />
    <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20 }}>PayTogether</span>
  </span>
);

export function Login() {
  const cents = billAmounts(stay);
  const paid = cents[0] + cents[1];
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="wrap between" style={{ padding: 24, alignItems: 'center' }}>
        {brand}
        <a href="#/trips" style={{ fontSize: 15, fontWeight: 500, textDecoration: 'none', padding: '12px 4px' }}>I have an invite link</a>
      </header>
      <main className="wrap" style={{ flex: 1, padding: '40px 24px 64px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 64 }}>
        <section style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <p className="mono" style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand)' }}>Group trips, without the spreadsheet</p>
          <h1 className="hero-h1" style={{ fontWeight: 700, fontSize: 64, lineHeight: 1.02, letterSpacing: '-0.03em' }}>Plan it together.<br />Split it fairly.</h1>
          <p style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--body)', maxWidth: 520 }}>
            One chat with an AI planner, a vote on every place, and a 0–100% split bar on every bill. Each person approves their own share in PayPal.
          </p>
          <div className="col" style={{ gap: 12, alignItems: 'flex-start' }}>
            {/* shortcut: goes straight to trips; wire Log in with PayPal (Identity) once Backend exists. */}
            <a href="#/trips" className="btn btn-primary" style={{ borderRadius: 999, fontSize: 17, fontWeight: 700, padding: '16px 28px', minHeight: 52 }}>
              <Icon d={icons.lock} size={20} />Log in with PayPal
            </a>
            <p className="small muted">[Swap in PayPal’s official button asset before launch.] We never see your PayPal password.</p>
          </div>
          <ol className="steps" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, maxWidth: 600 }}>
            {[['Plan in chat', 'Wayfinder drafts the route and the nights.'], ['Vote on places', 'Stays and dinners go to a group poll.'], ['Pay your share', 'You approve every charge in PayPal.']].map(([t, d], k) => (
              <li key={t} className="col" style={{ gap: 6, borderTop: '2px solid var(--ink)', paddingTop: 12 }}>
                <span className="mono small muted">0{k + 1}</span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{t}</span>
                <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>{d}</span>
              </li>
            ))}
          </ol>
        </section>
        <section aria-label="Example price preview" style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, borderRadius: 20, padding: 24, gap: 18, boxShadow: '0 24px 48px -24px rgba(27,30,35,0.25)' }}>
            <div className="between">
              <div className="col">
                <span className="eyebrow">Price preview · Stay</span>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 22 }}>Patio Azahar, Seville</span>
                <span className="muted" style={{ fontSize: 14 }}>2 nights · May 17–19</span>
              </div>
              <span className="mono" style={{ fontSize: 22, fontWeight: 500 }}>{eur(stay.total)}</span>
            </div>
            <div className="col" style={{ gap: 10 }}>
              {members.map((m, i) => (
                <div key={i} className="row">
                  <Chip i={i} />
                  <span style={{ flex: 1, fontSize: 15 }}>{m.name}</span>
                  <span className="mono muted" style={{ fontSize: 14 }}>{pct(stay.bps[i])}</span>
                  <span className="mono" style={{ fontSize: 15, width: 84, textAlign: 'right' }}>{eur(cents[i])}</span>
                </div>
              ))}
            </div>
            <div className="bar">
              {[0, 1].map((i) => <span key={i} style={{ width: `${stay.bps[i] / 100}%`, background: members[i].color }} />)}
            </div>
            <div className="between muted" style={{ fontSize: 14 }}>
              <span>2 of 4 shares paid</span>
              <span className="mono">{eur(paid)} collected</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function Trips() {
  const s = summarize(initialTxs);
  const myDue = billAmounts(stay)[3];
  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid var(--line)', background: '#fff' }}>
        <div className="wrap between" style={{ padding: '16px 24px', alignItems: 'center' }}>
          <a href="#/" style={{ textDecoration: 'none', color: 'var(--ink)' }}>{brand}</a>
          <button type="button" className="btn" style={{ borderRadius: 999, padding: '6px 14px 6px 6px', fontSize: 15, fontWeight: 400 }}>
            <Chip i={3} />Priya
          </button>
        </div>
      </header>
      <main className="wrap" style={{ padding: '40px 24px 64px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div className="between" style={{ alignItems: 'flex-end', gap: 24 }}>
          <div className="col" style={{ gap: 6 }}>
            <h1 style={{ fontSize: 40, letterSpacing: '-0.02em' }}>Your trips</h1>
            <p className="muted" style={{ fontSize: 16 }}>3 trips · 1 needs your payment</p>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field">
              <label htmlFor="join">Join with an invite link</label>
              <div className="row" style={{ gap: 8 }}>
                <input id="join" placeholder="paytogether.app/join/…" style={{ width: 240 }} />
                <button type="button" className="btn btn-outline" style={{ fontSize: 15 }}>Join</button>
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ fontSize: 15, padding: '0 20px' }}><Icon d={icons.plus} />New trip</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
          <a href="#/trip/plan" className="card" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 18 }}>
            <div className="between">
              <div className="col">
                <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 24 }}>Iberia in May</span>
                <span className="muted" style={{ fontSize: 14 }}>May 14–23 · Lisbon → Seville → Barcelona</span>
              </div>
              <span className="pill pill-orange">Booking</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {members.map((_, i) => <Chip key={i} i={i} size={30} />)}
              <span className="muted" style={{ fontSize: 14, marginLeft: 6 }}>4 members</span>
            </div>
            <div className="col" style={{ gap: 8 }}>
              <div className="bar"><span style={{ width: `${(s.prepaidCollected / s.prepaidTotal) * 100}%`, background: 'var(--brand)' }} /></div>
              <div className="between muted" style={{ fontSize: 14 }}>
                <span>Prepaid collected</span>
                <span className="mono" style={{ color: 'var(--ink)' }}>{eur(s.prepaidCollected)} / {eur(s.prepaidTotal)}</span>
              </div>
            </div>
            <div className="row" style={{ gap: 10, background: 'var(--orange-tint)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: '#6B3304' }}>
              <Icon d={icons.clock} />
              <span style={{ flex: 1 }}>Your Seville share is due</span>
              <span className="mono" style={{ fontWeight: 500 }}>{eur(myDue)}</span>
            </div>
          </a>
          <div className="card" style={{ gap: 18 }}>
            <div className="between">
              <div className="col">
                <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 24 }}>Kyoto, autumn</span>
                <span className="muted" style={{ fontSize: 14 }}>Dates not set · 3 destinations proposed</span>
              </div>
              <span className="pill pill-blue">Planning</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Chip i={3} size={30} />
              <span className="chip" style={{ width: 30, height: 30, background: '#475569', fontSize: 12 }}>■</span>
              <span className="muted" style={{ fontSize: 14, marginLeft: 6 }}>2 members · 1 invite pending</span>
            </div>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Wayfinder is waiting on a destinations vote: Kyoto, Kanazawa, Osaka.</p>
          </div>
          <div className="card" style={{ background: 'var(--bg)', gap: 18 }}>
            <div className="between">
              <div className="col">
                <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 24 }}>Big Sur weekend</span>
                <span className="muted" style={{ fontSize: 14 }}>Mar 6–8 · 5 members</span>
              </div>
              <span className="pill pill-gray">Completed</span>
            </div>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Every share was charged. Spending stays searchable.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
