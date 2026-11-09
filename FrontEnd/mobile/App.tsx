import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initialBills, initialChat, initialTxs, ME, wayfinderReply, type Bill, type ChatMsg, type Tx } from '../shared/trip';
import { c, TabBar, type Tab } from './src/ui';
import { Chat, Login, Plan, Shop, Split, Trips } from './src/Core';
import { Insights, Schedule, Spending } from './src/Money';

// shortcut: state-based navigation (10 screens, no deep links); move to Expo Router when links/push notifications land.
type Screen = 'login' | 'trips' | Tab | 'split' | 'shop';
const BACK: Partial<Record<Screen, Screen>> = { trips: 'login', chat: 'trips', plan: 'trips', schedule: 'trips', spending: 'trips', insights: 'trips', split: 'plan', shop: 'plan' };

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [txs, setTxs] = useState<Tx[]>(initialTxs);
  const [bills, setBills] = useState<Bill[]>(initialBills);
  const [chat, setChat] = useState(initialChat);
  const [vote, setVote] = useState<string | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const prev = BACK[screen];
      if (prev) setScreen(prev);
      return !!prev;
    });
    return () => sub.remove();
  }, [screen]);

  const setBill = (b: Bill) => setBills((all) => all.map((x) => (x.id === b.id ? b : x)));
  const tab = screen === 'split' || screen === 'shop' ? 'plan' : screen;
  const inTrip = screen !== 'login' && screen !== 'trips';

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: inTrip ? '#fff' : c.bg }} edges={['top', 'left', 'right', 'bottom']}>
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          {screen === 'login' && <Login onLogin={() => setScreen('trips')} />}
          {screen === 'trips' && <Trips onOpen={() => setScreen('chat')} />}
          {screen === 'chat' && (
            <Chat messages={chat} vote={vote} setVote={setVote} goSplit={() => setScreen('split')}
              onSend={(text) => {
                const time = new Date().toTimeString().slice(0, 5);
                const reply = wayfinderReply(text, txs, vote);
                setChat((m) => [...m, { from: ME, time, text }, ...(reply ? [{ from: 'ai', time, text: reply } as ChatMsg] : [])]);
              }} />
          )}
          {screen === 'plan' && <Plan bills={bills} goSplit={() => setScreen('split')} goShop={() => setScreen('shop')} />}
          {screen === 'split' && <Split bills={bills} setBill={setBill} onBack={() => setScreen('plan')} />}
          {screen === 'shop' && <Shop onBack={() => setScreen('plan')} />}
          {screen === 'schedule' && <Schedule txs={txs} addTxs={(rows) => setTxs((all) => [...all, ...rows])} />}
          {screen === 'spending' && <Spending txs={txs} />}
          {screen === 'insights' && <Insights txs={txs} />}
        </View>
        {inTrip && <TabBar active={tab} onChange={setScreen} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
