import { useEffect, useRef, useState } from 'react';
import { api, finishLogin, getSession, useTrip, type Ctx } from './api';
import { PHASES, type Trip } from '../../shared/trip';
import { Chat, TripHeader } from './ui';
import { Login } from './Entry';
import { GroupSetup, Home, NewTrip, Trips } from './Home';
import { Plan } from './Plan';
import { Schedule } from './Schedule';
import { Spending } from './Spending';
import { Dashboard } from './Dashboard';

// Routes: #/ landing (signed out) · #/home · #/trips · #/new · #/join · #/setup/{id} · #/trip/{id}/{plan|schedule|spending|dashboard}
const useHash = () => {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => { setHash(location.hash); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '');
};

export default function App() {
  const route = useHash();
  const [login, setLogin] = useState<{ busy: boolean; error?: string }>({ busy: true });
  useEffect(() => { finishLogin().then(() => setLogin({ busy: false }), (e) => setLogin({ busy: false, error: e.message })); }, []);
  if (login.busy) return <p className="wrap" style={{ padding: 48 }}>Signing you in…</p>;
  if (!getSession()) return <Login error={login.error} />; // every page past the landing needs Log in with PayPal
  if (route === 'trips') return <Trips />;
  if (route === 'new' || route === 'join') return <NewTrip key={route} mode={route === 'new' ? 'create' : 'join'} />;
  const setup = route.match(/^setup\/([\w-]+)/);
  if (setup) return <GroupSetup key={setup[1]} id={setup[1]} />;
  const m = route.match(/^trip\/([\w-]+)\/?(\w+)?/);
  if (!m) return <Home />; // #/, #/home and unknown routes
  return <Workspace key={m[1]} id={m[1]} tab={m[2] === 'shop' ? 'spending' : m[2] ?? 'plan'} />; // Shop now lives on Spending
}

function Workspace({ id, tab }: { id: string; tab: string }) {
  const { trip, setTrip, error, setError } = useTrip(id);
  // When the group confirms Places the plan is done: take everyone to Spending, once, on that change only.
  const phase = useRef(trip?.phase);
  useEffect(() => {
    const was = phase.current;
    phase.current = trip?.phase;
    if (was === 'PLACES' && trip && PHASES.indexOf(trip.phase) > PHASES.indexOf('PLACES')) location.hash = `#/trip/${id}/spending`;
  }, [trip, id]);
  if (!trip) return <p className="wrap" style={{ padding: 48 }} role={error ? 'alert' : undefined}>{error ?? 'Loading trip…'}</p>;

  const ctx: Ctx = {
    trip, me: Math.max(0, trip.members.findIndex((p) => p.user === getSession()?.user)), // the server only serves trips you are in
    act: async (path, body) => {
      try {
        const t = await api<Trip>(`/trips/${id}${path}`, { body: body ?? {} });
        if (t?.id) setTrip(t);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <TripHeader ctx={ctx} active={tab} />
      {error && <p role="alert" className="wrap small" style={{ marginTop: 12, padding: '10px 14px', background: 'var(--orange-tint)', color: 'var(--orange-ink)', borderRadius: 10 }}>{error}</p>}
      <div className="workspace">
        {tab === 'plan' && <aside><Chat ctx={ctx} /></aside>}
        <main>
          {tab === 'plan' && <Plan ctx={ctx} />}
          {tab === 'schedule' && <Schedule ctx={ctx} />}
          {tab === 'spending' && <Spending ctx={ctx} />}
          {tab === 'dashboard' && <Dashboard ctx={ctx} />}
        </main>
      </div>
    </div>
  );
}
