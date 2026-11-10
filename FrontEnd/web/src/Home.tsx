import { useEffect, useState, type FormEvent } from 'react';
import { money, mySummary, payStage, tripStatus, type Person, type Trip } from '../../shared/trip';
import { api, getSession, setSession, useTrip } from './api';
import { BackLink, Chip, Icon, icons, Logo, StatusPill } from './ui';

export type TripRow = Pick<Trip, 'id' | 'name' | 'phase' | 'currency' | 'members' | 'destinations' | 'window'> & { solo: boolean; mine: ReturnType<typeof mySummary> };

const link = 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1';
const person = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0';
const group = 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M18 14a7 7 0 0 1 4 7';
const alert = { background: 'var(--orange-tint)', color: 'var(--orange-ink)', padding: '10px 14px', borderRadius: 10 };
const h2 = { fontSize: 19 };
const STAGE_STYLE = {
  'Awaiting payment': { background: 'var(--orange-tint)', color: 'var(--orange-ink)' },
  Verifying: { background: 'var(--gray-tint)', color: 'var(--ink)' },
  Paid: { background: 'var(--blue-tint)', color: 'var(--brand)' },
} as const;
const striped = 'repeating-linear-gradient(135deg, #009CDE 0 3px, #BFE6F7 3px 6px)';

/** A group trip still waiting for its second member opens on the invite step, not the workspace. */
const tripHref = (t: Pick<TripRow, 'id' | 'solo' | 'members'>) => (!t.solo && t.members.length < 2 ? `#/setup/${t.id}` : `#/trip/${t.id}/plan`);
type Invite = { id: string; name: string; by: string; members: number };

function useTrips() {
  const [list, setList] = useState<TripRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<TripRow[]>('/trips').then(setList).catch((e) => setError(e.message)); }, []);
  return { list, setList, error, setError };
}

/** Trips can be in different currencies, so totals stay per currency: "€12.00 + $5.00". Nothing yet reads $0.00. */
function total(items: { currency: string; cents: number }[]) {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.currency, (by.get(i.currency) ?? 0) + i.cents);
  const parts = [...by].filter(([, c]) => c).map(([cur, c]) => money(c, cur));
  return parts.length ? parts.join(' + ') : money(0, items[0]?.currency ?? 'USD');
}

export function TopBar({ active }: { active?: 'home' | 'trips' }) {
  const s = getSession();
  const logout = () => { setSession(null); location.hash = '#/'; };
  const nav = (id: 'home' | 'trips', label: string) => (
    <a href={`#/${id}`} aria-current={active === id ? 'page' : undefined} className="btn"
      style={{ border: 'none', fontSize: 15, background: active === id ? 'var(--blue-tint)' : 'transparent', color: active === id ? 'var(--brand)' : 'var(--body)' }}>{label}</a>
  );
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
      <div className="wrap between" style={{ padding: '12px 24px', alignItems: 'center' }}>
        <span className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
          <a href="#/home" className="row" style={{ gap: 10, textDecoration: 'none', color: 'var(--ink)' }}>
            <Logo size={28} /><span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 19 }}>PayTogether</span>
          </a>
          <nav aria-label="Main" className="row" style={{ gap: 4 }}>{nav('home', 'Home')}{nav('trips', 'Trips')}</nav>
        </span>
        <span className="row small" style={{ gap: 12 }}>
          <span className="muted">{s?.name}</span>
          <button type="button" className="btn" onClick={logout}>Log out</button>
        </span>
      </div>
    </header>
  );
}

const CreateJoin = () => (
  <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
    <a href="#/new" className="btn btn-primary" style={{ minHeight: 48, padding: '0 20px', fontSize: 15 }}><Icon d={icons.plus} />Create a trip</a>
    <a href="#/join" className="btn" style={{ minHeight: 48, padding: '0 20px', fontSize: 15 }}><Icon d={link} />Join a trip</a>
  </div>
);

export function Home() {
  const { list, setList, error, setError } = useTrips();
  const gone = (id: string) => setList((l) => l?.filter((x) => x.id !== id) ?? null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  useEffect(() => { api<Invite[]>('/invites').then(setInvites).catch(() => {}); }, []);
  const answer = async (id: string, accept: boolean) => {
    try {
      await api(`/trips/${id}/${accept ? 'accept' : 'decline'}`, { body: {} });
      if (accept) location.hash = `#/trip/${id}/plan`;
      else setInvites((v) => v.filter((x) => x.id !== id));
    } catch (e) { setInviteError((e as Error).message); }
  };
  const first = getSession()?.name.split(' ')[0] ?? '';
  if (!list) return <><TopBar active="home" /><p className="wrap" style={{ padding: 48 }} role={error ? 'alert' : undefined}>{error ?? 'Loading…'}</p></>;

  const isNew = !list.length;
  const todos = list.flatMap((t) => t.mine.todos.map((x) => ({ ...x, trip: t })));
  const recent = list.flatMap((t) => t.mine.recent.map((x) => ({ ...x, trip: t }))).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 5);
  const cats = new Map<string, { currency: string; cents: number }[]>(['Hotel', 'Restaurant', 'Transport', 'Store'].map((c) => [c, []]));
  for (const t of list) for (const c of t.mine.byType) cats.set(c.type, [...(cats.get(c.type) ?? []), { currency: t.currency, cents: c.amount }]);
  const catSum = (v: { cents: number }[]) => v.reduce((a, x) => a + x.cents, 0);
  const catMax = Math.max(1, ...[...cats.values()].map(catSum)); // shortcut: bars compare raw cents across currencies; fine while trips share one
  const tripMax = Math.max(1, ...list.map((t) => t.mine.spent + t.mine.pending));
  const kpis = [
    { label: 'Total spent', value: total(list.map((t) => ({ currency: t.currency, cents: t.mine.spent }))), note: 'your share, all trips' },
    { label: 'Pending', value: total(list.map((t) => ({ currency: t.currency, cents: t.mine.pending }))), note: list.some((t) => t.mine.pending) ? 'waiting on PayPal' : 'nothing waiting' },
    { label: 'Upcoming bills', value: String(todos.length), note: todos.length ? todos[0].title : 'to accept' },
    { label: 'Trips', value: String(list.length), note: isNew ? 'none yet' : `${list.filter((t) => tripStatus(t) !== 'Completed').length} not completed` },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      <TopBar active="home" />
      <main className="wrap" style={{ padding: '32px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="col" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 36, letterSpacing: '-0.02em' }}>{isNew ? `Welcome to PayTogether, ${first}` : `Welcome back, ${first}`}</h1>
          <p className="muted" style={{ fontSize: 16 }}>
            {isNew ? 'Your dashboard fills in as you join trips and accept your share of bills.'
              : `${list.length} trip${list.length === 1 ? '' : 's'} · ${todos.length ? `${todos.length} bill${todos.length === 1 ? '' : 's'} waiting for you` : 'nothing waiting for you'}`}
          </p>
          <div style={{ marginTop: 10 }}><CreateJoin /></div>
        </div>
        {error && <p role="alert" className="small" style={alert}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          {kpis.map((k, i) => (
            <div key={k.label} className="col" style={{ gap: 6, padding: 18, borderRadius: 16, ...(i ? { background: '#fff', border: '1px solid var(--line)' } : { background: 'var(--ink)', color: '#fff' }) }}>
              <span style={{ fontSize: 13, color: i ? 'var(--muted)' : '#C9D6EA' }}>{k.label}</span>
              <span className="mono" style={{ fontSize: 28, fontWeight: 500, overflowWrap: 'anywhere' }}>{k.value}</span>
              <span style={{ fontSize: 13, color: i ? 'var(--muted)' : '#C9D6EA' }}>{k.note}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <section className="card" aria-labelledby="bytrip-h">
              <div className="between" style={{ alignItems: 'baseline' }}>
                <h2 id="bytrip-h" style={h2}>Your spending by trip</h2>
                <span className="row small" style={{ gap: 14, color: 'var(--body)' }}>
                  <span className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--brand)' }} />Spent</span>
                  <span className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: striped }} />Pending</span>
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 150px) 1fr auto', gap: 14, alignItems: 'center', fontSize: 14 }}>
                {isNew ? (
                  <>
                    <span className="muted">No trips yet</span>
                    <div style={{ height: 22, background: 'var(--gray-tint)', borderRadius: 6 }} />
                    <span className="mono muted">{money(0, 'USD')}</span>
                  </>
                ) : list.map((t) => (
                  <TripBar key={t.id} t={t} max={tripMax} />
                ))}
              </div>
              {isNew && <p className="muted" style={{ fontSize: 14 }}>Your share of every bill shows up here once you join or start a trip.</p>}
            </section>

            <section className="card" aria-labelledby="cat-h" style={{ gap: 14 }}>
              <h2 id="cat-h" style={h2}>By category</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 110px) 1fr auto', gap: '10px 14px', alignItems: 'center', fontSize: 14 }}>
                {[...cats].map(([type, v]) => (
                  <Cat key={type} type={type} value={total(v)} pct={(catSum(v) / catMax) * 100} />
                ))}
              </div>
            </section>

            <section className="card" aria-labelledby="act-h" style={{ gap: 6 }}>
              <h2 id="act-h" style={{ ...h2, marginBottom: 6 }}>Recent charges</h2>
              {!recent.length && <p className="muted" style={{ fontSize: 14, padding: '12px 0' }}>No charges yet. Nothing is ever charged until you accept your share of a bill.</p>}
              {recent.map((x) => (
                <a key={x.trip.id + x.id} href={`#/trip/${x.trip.id}/spending`} className="row" style={{ padding: '10px 0', borderTop: '1px solid var(--line-2)', textDecoration: 'none', color: 'var(--ink)' }}>
                  <span className="col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{x.vendor} · your share</span>
                    <span className="small muted">{x.trip.name} · {x.type} · {x.date}</span>
                  </span>
                  <span className="col" style={{ alignItems: 'flex-end', gap: 3 }}>
                    <span className="mono" style={{ fontSize: 15 }}>{money(x.amount, x.trip.currency)}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, ...STAGE_STYLE[payStage(x.status)] }}>{payStage(x.status)}</span>
                  </span>
                </a>
              ))}
            </section>
          </div>

          <aside style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <section className="card" aria-labelledby="todo-h" style={{ gap: 12, padding: 20 }}>
              <h2 id="todo-h" style={h2}>Needs you</h2>
              {inviteError && <p role="alert" className="small" style={alert}>{inviteError}</p>}
              {invites.map((x) => (
                <div key={x.id} className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--blue-tint)' }}>
                  <strong style={{ fontSize: 14 }}>Trip invite: {x.name}</strong>
                  <span className="small muted">{x.by} invited you · {x.members} member{x.members === 1 ? '' : 's'}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => answer(x.id, true)}>Join trip</button>
                    <button type="button" className="btn" onClick={() => answer(x.id, false)}>Decline</button>
                  </span>
                </div>
              ))}
              {!todos.length && !invites.length && <p className="muted" style={{ fontSize: 14 }}>You’re all caught up — nothing to accept or pay.</p>}
              {todos.map((x, k) => (
                <div key={k} className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: x.cta === 'Pay my share' ? 'var(--orange-tint)' : 'var(--blue-tint)' }}>
                  <span className="between" style={{ fontSize: 14 }}><strong>{x.title}</strong><span className="mono">{x.cents == null ? '—' : money(x.cents, x.trip.currency)}</span></span>
                  <span className="small muted">{x.trip.name}</span>
                  <a href={`#/trip/${x.trip.id}/spending`} className="btn btn-primary">{x.cta}</a>
                </div>
              ))}
            </section>

            <section className="card" aria-labelledby="trips-h" style={{ gap: 10, padding: 20 }}>
              <div className="between" style={{ alignItems: 'baseline' }}>
                <h2 id="trips-h" style={h2}>Your trips</h2>
                {!isNew && <a href="#/trips" style={{ fontSize: 14, fontWeight: 600 }}>All trips</a>}
              </div>
              {list.slice(0, 5).map((t) => (
                <div key={t.id} className="row" style={{ gap: 8, minHeight: 52, padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
                  <a href={tripHref(t)} className="between" style={{ flex: 1, minWidth: 0, alignItems: 'center', textDecoration: 'none', color: 'var(--ink)' }}>
                    <span className="col"><strong style={{ fontSize: 15 }}>{t.name}</strong><span style={{ fontSize: 12 }} className="muted">{meta(t)}</span></span>
                    <StatusPill t={t} />
                  </a>
                  <TripAction t={t} onGone={gone} onError={setError} />
                </div>
              ))}
              {isNew && <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>No trips yet. Use Create a trip or Join a trip above.</p>}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

/** Delete for the person who created the trip, Leave for everyone who joined. The server enforces both rules. */
function TripAction({ t, onGone, onError }: { t: TripRow; onGone: (id: string) => void; onError: (msg: string) => void }) {
  const owner = t.members[0]?.user === getSession()?.user;
  const run = async () => {
    const ask = owner
      ? `Delete “${t.name}” for everyone in it? The chat, plan and bills go too. This can’t be undone.`
      : `Leave “${t.name}”? You can join again later with its code.`;
    if (!confirm(ask)) return;
    try {
      await (owner ? api(`/trips/${t.id}`, { method: 'DELETE' }) : api(`/trips/${t.id}/leave`, { body: {} }));
      onGone(t.id);
    } catch (e) { onError((e as Error).message); }
  };
  return <button type="button" className="btn" style={{ color: 'var(--orange-ink)', flex: 'none' }} onClick={run} aria-label={`${owner ? 'Delete' : 'Leave'} ${t.name}`}>{owner ? 'Delete' : 'Leave'}</button>;
}

const meta = (t: TripRow) => [t.window ? `${t.window.start} → ${t.window.end}` : 'Dates not set', t.solo ? 'Just you' : `${t.members.length} member${t.members.length === 1 ? '' : 's'}`].join(' · ');

function TripBar({ t, max }: { t: TripRow; max: number }) {
  const { spent, pending } = t.mine;
  return (
    <>
      <span className="col"><strong style={{ fontWeight: 600 }}>{t.name}</strong><span style={{ fontSize: 12 }} className="muted">{tripStatus(t)}</span></span>
      <div role="img" aria-label={`${t.name}: ${money(spent, t.currency)} spent, ${money(pending, t.currency)} pending`} style={{ display: 'flex', height: 22, background: 'var(--gray-tint)', borderRadius: 6, overflow: 'hidden' }}>
        <span style={{ width: `${(spent / max) * 100}%`, background: 'var(--brand)' }} />
        <span style={{ width: `${(pending / max) * 100}%`, background: striped }} />
      </div>
      <span className="mono" style={{ textAlign: 'right' }}>{money(spent + pending, t.currency)}</span>
    </>
  );
}

const Cat = ({ type, value, pct }: { type: string; value: string; pct: number }) => (
  <>
    <span>{type}</span>
    <div style={{ height: 16, background: 'var(--gray-tint)', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: 'var(--brand)', borderRadius: 4 }} /></div>
    <span className="mono" style={{ textAlign: 'right' }}>{value}</span>
  </>
);

export function Trips() {
  const { list, setList, error, setError } = useTrips();
  const gone = (id: string) => setList((l) => l?.filter((x) => x.id !== id) ?? null);
  return (
    <div style={{ minHeight: '100vh' }}>
      <TopBar active="trips" />
      <main className="wrap" style={{ padding: '32px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <h1 style={{ fontSize: 36, letterSpacing: '-0.02em' }}>Your trips</h1>
          <CreateJoin />
        </div>
        {error && <p role="alert" className="small" style={alert}>{error}</p>}
        {list && !list.length && <p className="muted" style={{ fontSize: 16 }}>No trips yet. Create one, or join with the code a friend sent you.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
          {list?.map((t) => (
            <div key={t.id} className="col" style={{ gap: 8 }}>
            <a href={tripHref(t)} className="card" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 18, flex: 1 }}>
              <div className="between">
                <div className="col">
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 24 }}>{t.name}</span>
                  <span className="muted" style={{ fontSize: 14 }}>{meta(t)}{t.destinations.length ? ` · ${t.destinations.join(' → ')}` : ''}</span>
                </div>
                <StatusPill t={t} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                {t.members.map((m: Person) => <Chip key={m.name} p={m} size={30} />)}
              </div>
            </a>
            <span style={{ alignSelf: 'flex-end' }}><TripAction t={t} onGone={gone} onError={setError} /></span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/** #/new and #/join: create a trip (just me or a group) or join one with its code. */
export function NewTrip({ mode }: { mode: 'create' | 'join' }) {
  const [solo, setSolo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (path: string, body: (f: FormData) => unknown) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api<Trip>(path, { body: body(new FormData(e.currentTarget)) });
      location.hash = tripHref({ ...t, solo: !!t.solo });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const create = submit('/trips', (f) => ({
    name: String(f.get('name')).trim(), currency: f.get('currency'), solo,
    ...(f.get('start') && { start: f.get('start') }), ...(f.get('end') && { end: f.get('end') }),
  }));
  const join = submit('/join', (f) => ({ code: String(f.get('code')) }));

  const tab = (id: 'create' | 'join', label: string) => (
    <a href={id === 'create' ? '#/new' : '#/join'} aria-current={mode === id ? 'page' : undefined} className="btn"
      style={{ minHeight: 48, border: 'none', borderRadius: 11, fontSize: 15, ...(mode === id ? { background: '#fff', color: 'var(--brand)', fontWeight: 700, boxShadow: '0 1px 2px rgba(1,33,105,0.15)' } : { background: 'transparent', color: 'var(--body)', fontWeight: 500 }) }}>{label}</a>
  );
  const who = (on: boolean, d: string, title: string, desc: string, pick: () => void) => (
    <button type="button" aria-pressed={on} onClick={pick}
      style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16, borderRadius: 16, color: 'var(--ink)', textAlign: 'left', ...(on ? { border: '2px solid var(--brand)', background: '#F0F8FD' } : { border: '1px solid var(--input)', background: '#fff' }) }}>
      <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(on ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--gray-tint)' }) }}><Icon d={d} size={22} /></span>
      <span className="col" style={{ gap: 3 }}><span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span><span className="small muted" style={{ lineHeight: 1.4 }}>{desc}</span></span>
    </button>
  );
  const note = (text: string) => <p style={{ background: 'var(--blue-tint)', borderRadius: 14, padding: '14px 16px', fontSize: 14, lineHeight: 1.5 }}>{text}</p>;

  return (
    <div style={{ minHeight: '100vh' }}>
      <TopBar />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <BackLink />
        <nav aria-label="Create or join" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4, background: 'var(--gray-tint)', borderRadius: 14, padding: 4 }}>
          {tab('create', 'Create a trip')}{tab('join', 'Join a trip')}
        </nav>
        {error && <p role="alert" className="small" style={alert}>{error}</p>}

        {mode === 'create' ? (
          <form onSubmit={create} className="card" aria-labelledby="ct-h" style={{ borderRadius: 20, padding: 28, gap: 24 }}>
            <h1 id="ct-h" style={{ fontSize: 30, letterSpacing: '-0.02em' }}>Create a trip</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <label className="field" style={{ gridColumn: '1 / -1' }}>Trip name<input name="name" required maxLength={60} placeholder="e.g. Iberia in May" /></label>
              <label className="field">Start date (optional)<input name="start" type="date" /></label>
              <label className="field">End date (optional)<input name="end" type="date" /></label>
              <label className="field">Currency
                <select name="currency" defaultValue="USD">{['USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</select>
              </label>
            </div>
            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <legend className="field" style={{ marginBottom: 10 }}>Who’s going?</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {who(solo, person, 'Just me', 'Going alone. No splitting — plan and track your own spending.', () => setSolo(true))}
                {who(!solo, group, 'With a group', 'Friends join with the trip’s code. Every bill gets split bars.', () => setSolo(false))}
              </div>
            </fieldset>
            {solo
              ? note('Every bill is 100% yours and charged to your PayPal. You still get Wayfinder, the schedule and the spending dashboard. A solo trip can’t take other members later.')
              : note('Next you’ll add at least one more person: invite their PayTogether account by PayPal email, or send them the trip’s join code. The trip opens once someone has joined. New bills start split equally, and everyone moves only their own bar.')}
            <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--line-2)', paddingTop: 20 }}>
              <a href="#/home" className="btn" style={{ minHeight: 48, padding: '0 20px', fontSize: 15 }}>Cancel</a>
              <button type="submit" disabled={busy} className="btn btn-primary" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }}>{solo ? 'Create solo trip' : 'Create trip & add people'}</button>
            </div>
          </form>
        ) : (
          <form onSubmit={join} className="card" aria-labelledby="jt-h" style={{ borderRadius: 20, padding: 28, gap: 20 }}>
            <h1 id="jt-h" style={{ fontSize: 30, letterSpacing: '-0.02em' }}>Join a trip</h1>
            <label className="field">Join code
              <input name="code" required maxLength={12} autoComplete="off" autoCapitalize="characters" placeholder="K7QM2X" className="mono" style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }} />
            </label>
            <p className="small muted">Ask someone in the trip for its 6-character code. Joining adds you to the chat and to new bills. Nothing is charged until you accept your share.</p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <a href="#/home" className="btn" style={{ minHeight: 48, padding: '0 20px', fontSize: 15 }}>Cancel</a>
              <button type="submit" disabled={busy} className="btn btn-primary" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }}>Join trip</button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

/** #/setup/{id}: a new group trip waits here until at least one other account has joined. */
export function GroupSetup({ id }: { id: string }) {
  const { trip, setTrip, error, setError } = useTrip(id); // polls, so a friend joining shows up on its own
  const [copied, setCopied] = useState(false);
  if (!trip) return <><TopBar /><p className="wrap" style={{ padding: 48 }} role={error ? 'alert' : undefined}>{error ?? 'Loading trip…'}</p></>;

  const ready = trip.solo || trip.members.length >= 2;
  const invite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      setTrip(await api<Trip>(`/trips/${id}/invite`, { body: { email: String(new FormData(form).get('email')) } }));
      setError(null);
      form.reset();
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <TopBar />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <BackLink />
        <section className="card" aria-labelledby="gs-h" style={{ borderRadius: 20, padding: 28, gap: 22 }}>
          <div className="col" style={{ gap: 6 }}>
            <h1 id="gs-h" style={{ fontSize: 30, letterSpacing: '-0.02em' }}>Add people to {trip.name}</h1>
            <p className="muted" style={{ fontSize: 15 }}>A group trip needs at least one more person. Use either way below.</p>
          </div>
          {error && <p role="alert" className="small" style={alert}>{error}</p>}

          <div className="col" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 18 }}>Send the join code</h2>
            <div className="row" style={{ flexWrap: 'wrap', gap: 10, background: 'var(--bg)', border: '1px dashed var(--input)', borderRadius: 12, padding: '10px 12px' }}>
              <span className="mono" style={{ flex: '1 1 160px', fontSize: 24, fontWeight: 600, letterSpacing: '0.16em' }}>{trip.code}</span>
              <button type="button" className="btn btn-primary" onClick={() => navigator.clipboard?.writeText(trip.code).then(() => setCopied(true), () => {})}>{copied ? 'Copied' : 'Copy code'}</button>
            </div>
            <p className="small muted">They log in with PayPal, choose Join a trip, and enter this code.</p>
          </div>

          <form onSubmit={invite} className="col" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 18 }}>Or invite their account</h2>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <label htmlFor="invite-email" className="sr-only">Their PayPal email</label>
              <input id="invite-email" name="email" type="email" required placeholder="Their PayPal email" autoComplete="off"
                style={{ flex: '1 1 260px', minHeight: 48, border: '1px solid var(--input)', borderRadius: 12, padding: '0 14px', fontSize: 15 }} />
              <button type="submit" className="btn" style={{ minHeight: 48, padding: '0 20px', fontSize: 15, borderColor: 'var(--brand)', color: 'var(--brand)' }}>Invite</button>
            </div>
            <p className="small muted">Works for anyone who has logged in to PayTogether before. The invite waits on their home page until they accept.</p>
          </form>

          <div className="col" style={{ gap: 2 }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Who’s in · {trip.members.length}</h2>
            {trip.members.map((m) => (
              <div key={m.name + m.symbol} className="row" style={{ minHeight: 52, borderBottom: '1px solid var(--line-2)' }}>
                <Chip p={m} size={34} />
                <span className="col" style={{ flex: 1 }}><strong style={{ fontSize: 15 }}>{m.name}{m.user === getSession()?.user ? ' (you)' : ''}</strong><span style={{ fontSize: 12 }} className="muted">Joined</span></span>
                <Icon d={icons.check} />
              </div>
            ))}
            {trip.invites?.map((i) => (
              <div key={i.user} className="row" style={{ minHeight: 52, borderBottom: '1px solid var(--line-2)' }}>
                <span className="chip" style={{ width: 34, height: 34, background: 'var(--gray-tint)', color: 'var(--body)' }} aria-hidden="true"><Icon d={icons.clock} size={16} /></span>
                <span className="col" style={{ flex: 1 }}><strong style={{ fontSize: 15 }}>{i.name}</strong><span style={{ fontSize: 12 }} className="muted">Invited · waiting for them to accept</span></span>
              </div>
            ))}
          </div>

          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--line-2)', paddingTop: 20 }}>
            <span className="small muted" role="status">{ready ? 'Someone has joined, so the trip is ready.' : 'Waiting for at least one person to join…'}</span>
            {ready
              ? <a href={`#/trip/${id}/plan`} className="btn btn-primary" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }}>Continue to trip</a>
              : <button type="button" disabled className="btn btn-primary" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }}>Continue to trip</button>}
          </div>
        </section>
      </main>
    </div>
  );
}
