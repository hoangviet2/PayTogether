import { members, eur, pct, billAmounts, initialBills } from '../../shared/trip';
import { getSession, startLogin, useConfig } from './api';
import { Chip, Icon, icons, Logo } from './ui';

const stay = initialBills[1];
const brand = (
  <span className="row" style={{ gap: 10 }}>
    <Logo />
    <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20 }}>PayTogether</span>
  </span>
);

export function Login({ error }: { error?: string }) {
  const cfg = useConfig();
  const loggedIn = !!getSession();
  const cents = billAmounts(stay);
  const paid = cents[0] + cents[1];
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="wrap between" style={{ padding: 24, alignItems: 'center' }}>
        {brand}
        <a href="#/join" style={{ fontSize: 15, fontWeight: 500, textDecoration: 'none', padding: '12px 4px' }}>I have a join code</a>
      </header>
      <main className="wrap" style={{ flex: 1, padding: '40px 24px 64px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 64 }}>
        <section style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <p className="mono" style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand)' }}>Group trips, without the spreadsheet</p>
          <h1 className="hero-h1" style={{ fontWeight: 700, fontSize: 64, lineHeight: 1.02, letterSpacing: '-0.03em' }}>Plan it together.<br />Split it fairly.</h1>
          <p style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--body)', maxWidth: 520 }}>
            One chat with an AI planner, a vote on every place, and a 0–100% split bar on every bill. Each person approves their own share in PayPal.
          </p>
          <div className="col" style={{ gap: 12, alignItems: 'flex-start' }}>
            {error && <p role="alert" className="small" style={{ background: 'var(--orange-tint)', color: 'var(--orange-ink)', padding: '10px 14px', borderRadius: 10 }}>{error}</p>}
            {loggedIn ? (
              <a href="#/home" className="btn btn-primary" style={{ borderRadius: 999, fontSize: 17, fontWeight: 700, padding: '16px 28px', minHeight: 52 }}>Go to your home page</a>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!cfg?.paypalLogin} onClick={() => cfg?.paypalLogin && startLogin(cfg.paypalLogin)}
                style={{ borderRadius: 999, fontSize: 17, fontWeight: 700, padding: '16px 28px', minHeight: 52 }}>
                <Icon d={icons.lock} size={20} />Log in with PayPal
              </button>
            )}
            {cfg && !cfg.paypalLogin && <p className="small" style={{ color: 'var(--orange-ink)' }}>PayPal isn’t configured on the server.</p>}
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
                  <Chip p={members[i]} />
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
