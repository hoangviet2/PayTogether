import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { members, eur, pct, billAmounts, billView, initialBills, initialTxs, legs, pollOptions, products, summarize, ME, type Bill, type ChatMsg } from '../../shared/trip';
import { Btn, c, Chip, Icon, icons, Pill, s, ScreenTitle, SplitEditor } from './ui';

const Logo = ({ size = 30 }: { size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
    <View style={{ width: size * 0.37, height: size * 0.37, borderRadius: size, borderWidth: 2.4, borderColor: '#fff', marginRight: -size * 0.1 }} />
    <View style={{ width: size * 0.37, height: size * 0.37, borderRadius: size, borderWidth: 2.4, borderColor: c.sky }} />
  </View>
);

export function Login({ onLogin }: { onLogin: () => void }) {
  const dinner = { ...initialBills[0], bps: [2500, 2500, 2000, 3000] };
  return (
    <ScrollView contentContainerStyle={[s.pad, { paddingTop: 24, gap: 24 }]}>
      <View style={s.row}><Logo /><Text style={[s.h2, { fontSize: 20 }]}>PayTogether</Text></View>
      <Text style={[s.h1, { fontSize: 40, lineHeight: 42 }]}>Plan it together.{'\n'}Split it fairly.</Text>
      <Text style={[s.text, { fontSize: 17, lineHeight: 25, color: c.body }]}>Vote on places in one chat, then slide your share of every bill from 0% to 100%.</Text>
      <View style={[s.card, { borderRadius: 20 }]} accessibilityLabel="Example split">
        <View style={s.between}><Text style={[s.text, { fontWeight: '600' }]}>Bodega Triana</Text><Text style={s.mono}>{eur(dinner.total)}</Text></View>
        <View style={[s.bar, { height: 14, gap: 2 }]}>
          {members.map((m, i) => <View key={i} style={{ width: `${dinner.bps[i] / 100}%`, backgroundColor: m.color }} />)}
        </View>
        <View style={s.between}>
          {members.map((m, i) => <Text key={i} style={[s.small, { color: m.color, fontWeight: '600' }]}>{m.symbol} {dinner.bps[i] / 100}%</Text>)}
        </View>
      </View>
      {/* shortcut: skips auth; wire Log in with PayPal (Identity) once Backend exists. */}
      <Btn label="Log in with PayPal" icon={icons.lock} onPress={onLogin} style={{ minHeight: 52, borderRadius: 999 }} />
      <Btn kind="ghost" label="I have an invite link" onPress={onLogin} style={{ borderRadius: 999 }} />
      <Text style={[s.small, { textAlign: 'center', lineHeight: 19 }]}>We never see your PayPal password. Every charge needs your approval. [Use PayPal’s official button asset at launch.]</Text>
    </ScrollView>
  );
}

export function Trips({ onOpen }: { onOpen: () => void }) {
  const sum = summarize(initialTxs);
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <View style={s.between}>
        <View style={s.row}><Logo size={28} /><Text style={s.h2}>PayTogether</Text></View>
        <Chip i={ME} size={36} />
      </View>
      <View>
        <Text accessibilityRole="header" style={s.h1}>Your trips</Text>
        <Text style={s.small}>1 bill needs you</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [s.card, { opacity: pressed ? 0.85 : 1 }]}>
        <View style={[s.between, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.h2, { fontSize: 20 }]}>Iberia in May</Text>
            <Text style={s.small}>May 14–23 · Lisbon → Seville → Barcelona</Text>
          </View>
          <Pill label="Booking" tone="orange" />
        </View>
        <View style={[s.row, { gap: 6 }]}>{members.map((_, i) => <Chip key={i} i={i} size={28} />)}</View>
        <View style={s.bar}><View style={{ width: `${(sum.prepaidCollected / sum.prepaidTotal) * 100}%`, backgroundColor: c.brand }} /></View>
        <View style={s.between}>
          <Text style={s.small}>Prepaid collected</Text>
          <Text style={[s.mono, { fontSize: 13 }]}>{eur(sum.prepaidCollected)} / {eur(sum.prepaidTotal)}</Text>
        </View>
        <View style={[s.between, { backgroundColor: c.orangeTint, borderRadius: 12, padding: 12 }]}>
          <Text style={{ color: '#6B3304', fontSize: 14 }}>Seville share due</Text>
          <Text style={[s.mono, { color: '#6B3304' }]}>{eur(billAmounts(initialBills[1])[ME])}</Text>
        </View>
      </Pressable>
      <View style={s.card}>
        <View style={s.between}>
          <View style={{ flex: 1 }}><Text style={[s.h2, { fontSize: 20 }]}>Kyoto, autumn</Text><Text style={s.small}>Voting on destinations · 2 members</Text></View>
          <Pill label="Planning" />
        </View>
      </View>
      <View style={[s.card, { backgroundColor: c.bg }]}>
        <View style={s.between}>
          <View style={{ flex: 1 }}><Text style={[s.h2, { fontSize: 20 }]}>Big Sur weekend</Text><Text style={s.small}>Mar 6–8 · all shares charged</Text></View>
          <Pill label="Completed" tone="gray" />
        </View>
      </View>
      <View style={s.row}>
        <Btn kind="outline" label="Join with link" style={{ flex: 1 }} />
        <Btn label="New trip" icon={icons.plus} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

export function Chat({ messages, onSend, vote, setVote, goSplit }: {
  messages: ChatMsg[]; onSend: (t: string) => void; vote: string | null; setVote: (v: string | null) => void; goSplit: () => void;
}) {
  const [text, setText] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const send = () => { if (text.trim()) onSend(text.trim()); setText(''); };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenTitle title="Iberia in May" sub="4 members · Wayfinder active" />
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd()} contentContainerStyle={[s.pad, { gap: 16 }]} accessibilityLiveRegion="polite">
        {messages.map((m, k) =>
          m.from === ME ? (
            <View key={k} style={{ alignSelf: 'flex-end', maxWidth: '80%', alignItems: 'flex-end', gap: 4 }}>
              <Text style={s.small}>You · {m.time}</Text>
              <Text style={{ backgroundColor: '#7E22CE', color: '#fff', fontSize: 15, lineHeight: 21, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderBottomRightRadius: 4 }}>{m.text}</Text>
            </View>
          ) : (
            <View key={k} style={[s.row, { alignItems: 'flex-start' }]}>
              {m.from === 'ai'
                ? <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}><Icon d={icons.compass} size={18} color={c.bg} /></View>
                : <Chip i={m.from} />}
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.small}><Text style={{ fontWeight: '700', color: c.ink }}>{m.from === 'ai' ? 'Wayfinder' : members[m.from].name}</Text> · {m.time}</Text>
                <Text style={[s.text, { lineHeight: 21 }]}>{m.text}</Text>
                {m.card === 'dinner' && (
                  <Pressable accessibilityRole="button" onPress={goSplit} style={[s.card, { padding: 12, gap: 6 }]}>
                    <View style={s.between}><Text style={[s.text, { fontWeight: '600' }]}>Bodega Triana</Text><Text style={s.mono}>€340.00</Text></View>
                    <Text style={s.small}>2 of 4 accepted · tap to open split bars</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ),
        )}
        <View style={[s.card, { gap: 8 }]}>
          <Text style={s.eyebrow}>Poll · closes Fri 6:00 PM</Text>
          <Text style={s.h2}>Where should we stay in Barcelona?</Text>
          {pollOptions.map((o) => {
            const mine = vote === o.id;
            const voters = mine ? [...o.voters, ME] : o.voters;
            return (
              <Pressable key={o.id} accessibilityRole="button" accessibilityState={{ selected: mine }} onPress={() => setVote(mine ? null : o.id)}
                style={[s.between, { minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: mine ? 2 : 1, borderColor: mine ? '#7E22CE' : c.line, backgroundColor: mine ? '#FBF7FE' : '#fff' }]}>
                <Text style={[s.text, { flex: 1 }]}>{o.name}</Text>
                <Text style={{ letterSpacing: 2 }}>{voters.length ? voters.map((v) => <Text key={v} style={{ color: members[v].color }}>{members[v].symbol}</Text>) : '—'}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={[s.row, { padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: c.line2 }]}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="Message, or ask @Wayfinder" placeholderTextColor={c.muted} accessibilityLabel="Message" style={[s.input, { flex: 1 }]} returnKeyType="send" />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" onPress={send} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={icons.send} size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export function Plan({ bills, goSplit, goShop }: { bills: Bill[]; goSplit: () => void; goShop: () => void }) {
  const [nights, setNights] = useState<number[]>(legs.map((l) => l.nights));
  const startOf = (k: number) => legs[0].from + nights.slice(0, k).reduce((a, b) => a + b, 0);
  const tones = { blue: c.blueTint, orange: c.orangeTint, gray: c.grayTint };
  const casa = initialTxs.filter((t) => t.vendor === 'Casa do Largo');
  return (
    <>
      <ScreenTitle title="Plan" sub={`Iberia in May · May ${startOf(0)}–${startOf(legs.length)}`} />
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h2}>Timeline</Text>
        {legs.map((l, k) => (
          <View key={l.name} style={[s.between, { backgroundColor: tones[l.tone], borderRadius: 12, padding: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { fontWeight: '700' }]}>{l.name}</Text>
              <Text style={s.small}>May {startOf(k)} → {startOf(k + 1)} · {l.status.toLowerCase()}</Text>
            </View>
            <View style={[s.row, { gap: 4 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Fewer nights in ${l.name}`} onPress={() => setNights((n) => n.map((x, j) => (j === k ? Math.max(1, x - 1) : x)))} style={stepper}><Text style={s.text}>−</Text></Pressable>
              <Text style={[s.mono, { minWidth: 28, textAlign: 'center' }]}>{nights[k]}n</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`More nights in ${l.name}`} onPress={() => setNights((n) => n.map((x, j) => (j === k ? x + 1 : x)))} style={stepper}><Text style={s.text}>+</Text></Pressable>
            </View>
          </View>
        ))}
        <View style={{ marginTop: 8 }}>
          <Text style={s.h2}>Split bills</Text>
          <Text style={s.small}>Each bill has a 0–100% bar per person</Text>
        </View>
        {bills.map((b) => {
          const v = billView(b);
          return (
            <Pressable key={b.id} accessibilityRole="button" onPress={goSplit} style={[s.card, { gap: 6 }]}>
              <View style={s.between}><Text style={[s.text, { fontWeight: '600' }]}>{b.title}</Text><Text style={s.mono}>{eur(b.total)}</Text></View>
              <View style={s.between}>
                <Text style={{ fontSize: 13, color: v.done ? c.brand : c.orangeInk, fontWeight: '600' }}>
                  {b.frozen ? (b.paid ? 'Approved in PayPal' : `Pay ${eur(v.cents[ME])}`) : v.done ? 'Accepted' : 'Needs your acceptance'}
                </Text>
                <Text style={s.small}>You {pct(b.bps[ME])} · {eur(v.cents[ME])}</Text>
              </View>
            </Pressable>
          );
        })}
        <View style={[s.card, { gap: 6 }]}>
          <View style={s.between}><Text style={[s.text, { fontWeight: '600' }]}>Casa do Largo</Text><Text style={s.mono}>{eur(casa[0].total)}</Text></View>
          <Text style={[s.small, { color: c.brand, fontWeight: '600' }]}>Paid and booked</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={goShop} style={[s.card, s.between]}>
          <View style={{ flex: 1 }}><Text style={[s.text, { fontWeight: '600' }]}>Shop for the trip</Text><Text style={s.small}>Search gear · assisted checkout</Text></View>
          <Icon d={icons.chevron} />
        </Pressable>
      </ScrollView>
    </>
  );
}
const stepper = { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: c.input, backgroundColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const };

export function Split({ bills, setBill, onBack }: { bills: Bill[]; setBill: (b: Bill) => void; onBack: () => void }) {
  return (
    <>
      <ScreenTitle title="Split bills" sub="Drag each bar from 0% to 100%" onBack={onBack} />
      <ScrollView contentContainerStyle={s.pad}>
        {bills.map((b) => <SplitEditor key={b.id} bill={b} onChange={setBill} />)}
      </ScrollView>
    </>
  );
}

// shortcut: filters the sample catalog locally; Channel3 + Kernel calls belong in the Backend.
export function Shop({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState('');
  const list = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase().trim()));
  return (
    <>
      <ScreenTitle title="Shop" onBack={onBack} />
      <ScrollView contentContainerStyle={s.pad}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search products" placeholderTextColor={c.muted} accessibilityLabel="Search products" style={s.input} />
        <View style={[s.card, { backgroundColor: c.orangeTint, borderColor: c.orangeTint }]}>
          <View style={s.between}><Text style={[s.text, { fontWeight: '700', color: '#6B3304' }]}>Assisted checkout · Ridge & Co</Text><Text style={[s.mono, { color: '#6B3304' }]}>08:42</Text></View>
          <Text style={{ color: '#6B3304', fontSize: 14, lineHeight: 20 }}>Item is in the cart at checkout. Your turn: log in and approve in PayPal. The assistant never enters passwords or presses Pay.</Text>
          <Btn label="Open live view" />
        </View>
        {list.map((p) => (
          <View key={p.id} style={[s.card, s.row, { alignItems: 'flex-start' }]}>
            <View accessibilityLabel={`Image placeholder: ${p.title}`} style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[s.mono, { fontSize: 10, color: c.body }]}>[image]</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.text, { fontWeight: '600' }]}>{p.title}</Text>
              <Text style={s.mono}>{eur(p.price)}</Text>
              <Text style={[s.small, { color: p.paypal ? c.brand : c.orangeInk }]}>{p.paypal ? 'Pays with PayPal on merchant site' : 'Assisted checkout available'}</Text>
              <Btn kind="outline" label={p.paypal ? 'Open merchant' : 'Assisted checkout'} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}
