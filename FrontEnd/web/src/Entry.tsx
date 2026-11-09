import { useEffect, useState, type FormEvent } from 'react';
import { members, eur, pct, billAmounts, initialBills, PHASE_LABEL, type Person, type Trip } from '../../shared/trip';
import { api, getSession, setSession, startLogin, useConfig } from './api';
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
        <a href="#/trips" style={{ fontSize: 15, fontWeight: 500, textDecoration: 'none', padding: '12px 4px' }}>I have a join code</a>
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
              <a href="#/trips" className="btn btn-primary" style={{ borderRadius: 999, fontSize: 17, fontWeight: 700, padding: '16px 28px', minHeight: 52 }}>Go to your trips</a>
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

type TripRow = { id: string; name: string; phase: Trip['phase']; members: Person[]; destinations: string[]; window: Trip['window'] };

export function Trips() {
  const [list, setList] = useState<TripRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<TripRow[]>('/trips').then(setList).catch((e) => setError(e.message)); }, []);

  const submit = (path: string, body: (f: FormData) => unknown) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const t = await api<Trip>(path, { body: body(new FormData(e.currentTarget)) });
      location.hash = `#/trip/${t.id}/plan`;
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const create = submit('/trips', (f) => ({ name: String(f.get('name')).trim(), currency: f.get('currency') }));
  const join = submit('/join', (f) => ({ code: String(f.get('code')) }));
  const logout = () => { setSession(null); location.hash = '#/'; };

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid var(--line)', background: '#fff' }}>
        <div className="wrap between" style={{ padding: '16px 24px', alignItems: 'center' }}>
          <a href="#/" style={{ textDecoration: 'none', color: 'var(--ink)' }}>{brand}</a>
          <span className="row small" style={{ gap: 12 }}>
            <span className="muted">{getSession()?.name}</span>
            <button type="button" className="btn" style={{ minHeight: 40 }} onClick={logout}>Log out</button>
          </span>
        </div>
      </header>
      <main className="wrap" style={{ padding: '40px 24px 64px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div className="col" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 40, letterSpacing: '-0.02em' }}>{list?.length ? 'Your trips' : 'Plan your first trip'}</h1>
          <p className="muted" style={{ fontSize: 16 }}>Name it, share its join code with who’s coming, then tell Wayfinder where you want to go.</p>
        </div>
        {error && <p role="alert" className="small" style={{ background: 'var(--orange-tint)', color: 'var(--orange-ink)', padding: '10px 14px', borderRadius: 10 }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
          <form onSubmit={create} className="card" style={{ gap: 14 }} aria-labelledby="new-h">
            <h2 id="new-h" style={{ fontSize: 22 }}>New trip</h2>
            <label className="field">Trip name<input name="name" required maxLength={60} placeholder="Summer with the crew" /></label>
            <label className="field">Currency
              <select name="currency" defaultValue="USD">{['USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 15 }}><Icon d={icons.plus} />Create trip and open chat</button>
          </form>
          <form onSubmit={join} className="card" style={{ gap: 14 }} aria-labelledby="join-h">
            <h2 id="join-h" style={{ fontSize: 22 }}>Join a trip</h2>
            <p className="muted small">Ask someone in the trip for its 6-character join code.</p>
            <label className="field">Join code
              <input name="code" required maxLength={12} autoComplete="off" autoCapitalize="characters" placeholder="K7QM2X" className="mono" style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }} />
            </label>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 15 }}>Join trip</button>
          </form>
          {list?.map((t) => (
            <a key={t.id} href={`#/trip/${t.id}/plan`} className="card" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 18 }}>
              <div className="between">
                <div className="col">
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 24 }}>{t.name}</span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {t.window ? `${t.window.start} → ${t.window.end}` : 'Dates not set'}{t.destinations.length ? ` · ${t.destinations.join(' → ')}` : ''}
                  </span>
                </div>
                <span className="pill pill-blue">{PHASE_LABEL[t.phase]}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {t.members.map((m) => <Chip key={m.name} p={m} size={30} />)}
                <span className="muted" style={{ fontSize: 14, marginLeft: 6 }}>{t.members.length} members</span>
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
