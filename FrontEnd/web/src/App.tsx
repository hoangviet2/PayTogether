import { useEffect, useState } from 'react';
import { initialBills, initialChat, initialTxs, ME, type Bill, type Tx } from '../../shared/trip';
import { Chat, TripHeader } from './ui';
import { Login, Trips } from './Entry';
import { Plan } from './Plan';
import { Schedule } from './Schedule';
import { Spending } from './Spending';
import { Dashboard } from './Dashboard';
import { Shop } from './Shop';

// shortcut: hash routing and in-memory state, swap for a router + Backend API when there is one.
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
  const [txs, setTxs] = useState<Tx[]>(initialTxs);
  const [bills, setBills] = useState<Bill[]>(initialBills);
  const [chat, setChat] = useState(initialChat);
  const [vote, setVote] = useState<string | null>(null);

  if (route === 'trips') return <Trips />;
  const tab = route.match(/^trip\/(\w+)/)?.[1];
  if (!tab) return <Login />;

  const setBill = (b: Bill) => setBills((all) => all.map((x) => (x.id === b.id ? b : x)));
  const send = (text: string) =>
    setChat((c) => [...c, { from: ME, time: new Date().toTimeString().slice(0, 5), text }]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <TripHeader active={tab} />
      <div className="workspace">
        <aside><Chat messages={chat} onSend={send} /></aside>
        <main>
          {tab === 'plan' && <Plan bills={bills} setBill={setBill} vote={vote} setVote={setVote} />}
          {tab === 'schedule' && <Schedule txs={txs} addTx={(t) => setTxs((all) => [...all, t])} />}
          {tab === 'spending' && <Spending txs={txs} />}
          {tab === 'dashboard' && <Dashboard txs={txs} />}
          {tab === 'shop' && <Shop />}
        </main>
      </div>
    </div>
  );
}
