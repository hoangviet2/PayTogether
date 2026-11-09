import { useEffect, useState } from 'react';
import { api, saveMember, savedMember, useTrip, type Ctx } from './api';
import type { Trip } from '../../shared/trip';
import { Chat, TripHeader } from './ui';
import { Login, Trips } from './Entry';
import { Plan } from './Plan';
import { Schedule } from './Schedule';
import { Spending } from './Spending';
import { Dashboard } from './Dashboard';
import { Shop } from './Shop';

// Routes: #/ landing · #/trips · #/trip/{id}/{plan|schedule|spending|dashboard|shop}
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
  if (route === 'trips') return <Trips />;
  const m = route.match(/^trip\/([\w-]+)\/?(\w+)?/);
  if (!m) return <Login />;
  return <Workspace key={m[1]} id={m[1]} tab={m[2] ?? 'plan'} />;
}

function Workspace({ id, tab }: { id: string; tab: string }) {
  const { trip, setTrip, error, setError } = useTrip(id);
  const [me, setMeState] = useState(() => savedMember(id));
  if (!trip) return <p className="wrap" style={{ padding: 48 }} role={error ? 'alert' : undefined}>{error ?? 'Loading trip…'}</p>;

  const ctx: Ctx = {
    trip, me: Math.min(me, trip.members.length - 1),
    setMe: (n) => { saveMember(id, n); setMeState(n); },
    act: async (path, body) => {
      try {
        const t = await api<Trip>(`/trips/${id}${path}`, { body: body ?? {}, member: me });
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
        <aside><Chat ctx={ctx} /></aside>
        <main>
          {tab === 'plan' && <Plan ctx={ctx} />}
          {tab === 'schedule' && <Schedule ctx={ctx} />}
          {tab === 'spending' && <Spending ctx={ctx} />}
          {tab === 'dashboard' && <Dashboard ctx={ctx} />}
          {tab === 'shop' && <Shop ctx={ctx} />}
        </main>
      </div>
    </div>
  );
}
