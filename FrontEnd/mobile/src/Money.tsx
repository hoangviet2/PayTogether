import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { members, displayName, eur, pct, largestRemainder, legOf, legs, mayGrid, planned, searchTxs, summarize, trip, ME, type Tx } from '../../shared/trip';
import { Btn, c, Chip, icons, s, ScreenTitle, Segmented } from './ui';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (d: number) => WEEK[new Date(Date.UTC(2027, 4, d)).getUTCDay()];
const DAYS = Array.from({ length: trip.lastDay - trip.firstDay + 1 }, (_, k) => trip.firstDay + k);

function TxRow({ t }: { t: Tx }) {
  return (
    <View style={[s.row, { paddingVertical: 8 }]}>
      <Chip i={t.member} size={28} />
      <View style={{ flex: 1 }}>
        <Text style={[s.text, { fontWeight: '600', fontSize: 14 }]}>{t.vendor}</Text>
        <Text style={[s.small, { fontSize: 12 }]}>{displayName(t.member)} · {t.time} · {t.status}</Text>
      </View>
      <Text style={[s.mono, { fontSize: 14 }]}>{eur(t.amount)}</Text>
    </View>
  );
}
const PlannedRow = ({ p }: { p: (typeof planned)[number] }) => (
  <View style={[s.row, { paddingVertical: 8 }]}>
    <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.brand }} />
    <View style={{ flex: 1 }}>
      <Text style={[s.text, { fontWeight: '600', fontSize: 14 }]}>{p.title}</Text>
      <Text style={[s.small, { fontSize: 12 }]}>{p.meta}</Text>
    </View>
    <Text style={[s.mono, { fontSize: 14 }]}>{p.amount === null ? '—' : eur(p.amount)}</Text>
  </View>
);

export function Schedule({ txs, addTxs }: { txs: Tx[]; addTxs: (t: Tx[]) => void }) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [sel, setSel] = useState(17);
  const [logging, setLogging] = useState(false);
  const dayItems = (d: number) => txs.filter((t) => t.day === d);
  return (
    <>
      <ScreenTitle title="Schedule" sub="Everyone’s transactions, day by day" />
      <ScrollView contentContainerStyle={s.pad}>
        <Segmented options={[['list', 'List'], ['calendar', 'Calendar']]} value={view} onChange={setView} />
        {view === 'list'
          ? DAYS.map((d) => {
              const items = dayItems(d);
              const plans = planned.filter((p) => p.day === d);
              if (!items.length && !plans.length) return null;
              return (
                <View key={d} style={[s.card, { gap: 0 }]}>
                  <View style={s.between}><Text style={s.h2}>{weekday(d)}, May {d}</Text><Text style={s.small}>{legOf(d)}</Text></View>
                  {items.map((t, k) => <TxRow key={k} t={t} />)}
                  {plans.map((p) => <PlannedRow key={p.title} p={p} />)}
                </View>
              );
            })
          : (
            <>
              <View style={s.card}>
                <Text style={s.h2}>May 2027</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, k) => <Text key={k} style={[s.small, { width: '14.28%', textAlign: 'center', fontWeight: '600' }]}>{w}</Text>)}
                  {mayGrid().map((cell, k) => {
                    const on = cell.inMonth && cell.day === sel;
                    const syms = cell.inMonth ? [...new Set(dayItems(cell.day).map((t) => t.member))] : [];
                    const inTrip = cell.inMonth && cell.day >= trip.firstDay && cell.day <= trip.lastDay;
                    return (
                      <Pressable key={k} disabled={!cell.inMonth} onPress={() => setSel(cell.day)} accessibilityRole="button" accessibilityState={{ selected: on }}
                        accessibilityLabel={`${cell.inMonth ? 'May' : cell.day > 20 ? 'April' : 'June'} ${cell.day}${syms.length ? `, ${syms.length} people spent` : ''}`}
                        style={{ width: '14.28%', minHeight: 52, alignItems: 'center', paddingTop: 4, borderRadius: 10, borderWidth: on ? 2 : 0, borderColor: c.brand, backgroundColor: inTrip ? c.blueTint : 'transparent' }}>
                        <Text style={{ fontSize: 14, color: cell.inMonth ? c.ink : '#9AA0A8', fontWeight: on ? '700' : '400' }}>{cell.day}</Text>
                        <Text style={{ fontSize: 10 }}>{syms.map((i) => <Text key={i} style={{ color: members[i].color }}>{members[i].symbol}</Text>)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[s.row, { flexWrap: 'wrap' }]}>
                  {legs.map((l) => <Text key={l.name} style={s.small}>{l.name} {l.from}–{l.to}</Text>)}
                </View>
              </View>
              <View style={[s.card, { gap: 0 }]}>
                <Text style={s.h2}>{weekday(sel)}, May {sel}</Text>
                <Text style={s.small}>{sel >= trip.firstDay && sel <= trip.lastDay ? legOf(sel) : 'Outside the trip'}</Text>
                {dayItems(sel).map((t, k) => <TxRow key={k} t={t} />)}
                {planned.filter((p) => p.day === sel).map((p) => <PlannedRow key={p.title} p={p} />)}
                {!dayItems(sel).length && !planned.some((p) => p.day === sel) && <Text style={[s.small, { paddingTop: 8 }]}>Nothing logged this day.</Text>}
              </View>
            </>
          )}
        <Btn label="Log expense" icon={icons.plus} onPress={() => setLogging(true)} />
      </ScrollView>
      <LogExpense visible={logging} day={view === 'calendar' ? sel : 18} onClose={() => setLogging(false)} onSave={(rows) => { addTxs(rows); setLogging(false); }} />
    </>
  );
}

function LogExpense({ visible, day, onClose, onSave }: { visible: boolean; day: number; onClose: () => void; onSave: (t: Tx[]) => void }) {
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'me' | 'equal'>('equal');
  const cents = /^\d+([.,]\d{1,2})?$/.test(amount.trim()) ? Math.round(parseFloat(amount.replace(',', '.')) * 100) : 0;
  const who = mode === 'me' ? [ME] : members.map((_, i) => i);
  const shares = cents > 0 ? largestRemainder(cents, who.map(() => 1)) : [];
  const leg = legOf(day) ?? 'Barcelona';
  const save = () => {
    if (!cents || !vendor.trim()) return;
    const bps = largestRemainder(10000, who.map(() => 1));
    onSave(who.map((member, k) => ({
      member, day, time: new Date().toTimeString().slice(0, 5), vendor: vendor.trim(), type: 'Other',
      leg: `${leg} · leg ${legs.findIndex((l) => l.name === leg) + 1}`, amount: shares[k], total: cents, shareBp: bps[k], source: 'On-trip log', status: 'logged',
    })));
    setVendor('');
    setAmount('');
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,33,105,0.35)' }}>
        <View style={[s.card, { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 20, paddingBottom: 36 }]}>
          <Text accessibilityRole="header" style={[s.h2, { fontSize: 20 }]}>Log expense</Text>
          <Text style={s.small}>{weekday(day)} {day} · {leg} · paid by {displayName(ME)}</Text>
          <TextInput value={vendor} onChangeText={setVendor} placeholder="Vendor" placeholderTextColor={c.muted} accessibilityLabel="Vendor" style={s.input} />
          <TextInput value={amount} onChangeText={setAmount} placeholder="Amount (EUR)" placeholderTextColor={c.muted} accessibilityLabel="Amount in euros" keyboardType="decimal-pad" style={s.input} />
          <Segmented options={[['me', 'Me only'], ['equal', 'Equal, all 4']]} value={mode} onChange={setMode} />
          <Text style={s.small}>{cents ? `${eur(shares[0])} each · ` : ''}Each person’s share is charged to their PayPal automatically.</Text>
          <View style={s.row}>
            <Btn kind="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <Btn label="Save expense" onPress={save} style={{ flex: 1, opacity: cents && vendor.trim() ? 1 : 0.5 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function Spending({ txs }: { txs: Tx[] }) {
  const [q, setQ] = useState('');
  const sum = summarize(txs);
  const hits = searchTxs(txs, q);
  const tone = { captured: c.blueTint, approved: c.blueTint, created: c.orangeTint, logged: c.grayTint };
  return (
    <>
      <ScreenTitle title="Spending" right={<Text style={[s.mono, { fontSize: 18 }]}>{eur(sum.total)}</Text>} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <TextInput value={q} onChangeText={setQ} placeholder="Search transactions, e.g. hotel > 100" placeholderTextColor={c.muted} accessibilityLabel="Search transactions" style={[s.input, { borderWidth: 2, borderColor: c.brand }]} />
        <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
          {[['Captured', sum.captured, c.blueTint], ['Pending', sum.pending, c.orangeTint], ['Logged', sum.logged, c.grayTint]].map(([l, v, bg]) => (
            <View key={l as string} style={{ flex: 1, minWidth: 100, backgroundColor: bg as string, borderRadius: 12, padding: 10 }}>
              <Text style={s.small}>{l}</Text>
              <Text style={[s.mono, { fontSize: 14 }]}>{eur(v as number)}</Text>
            </View>
          ))}
        </View>
        <View style={[s.card, { gap: 0, paddingVertical: 4 }]}>
          {hits.map((t, k) => (
            <View key={k} style={[s.row, { paddingVertical: 10, borderTopWidth: k ? 1 : 0, borderColor: c.line2 }]}>
              <Chip i={t.member} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={[s.text, { fontWeight: '600', fontSize: 14 }]}>{t.vendor}</Text>
                <Text style={[s.small, { fontSize: 12 }]}>{members[t.member].name} · May {t.day} · {t.leg.split(' ·')[0]}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={[s.mono, { fontSize: 14 }]}>{eur(t.amount)}</Text>
                <View style={[s.row, { gap: 4 }]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: t.status === 'created' ? c.orangeInk : c.body, backgroundColor: tone[t.status], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>{t.status}</Text>
                  <Text style={[s.small, { fontSize: 11 }]}>{pct(t.shareBp)}</Text>
                </View>
              </View>
            </View>
          ))}
          {!hits.length && <Text style={[s.small, { paddingVertical: 12 }]}>No transactions match.</Text>}
        </View>
      </ScrollView>
    </>
  );
}

export function Insights({ txs }: { txs: Tx[] }) {
  const sum = summarize(txs);
  const maxMember = Math.max(1, ...sum.byMember);
  const legTotals = sum.byLeg.map((l) => ({ name: l.name, total: l.perMember.reduce((a, b) => a + b, 0), perMember: l.perMember }));
  const tiles: [string, string, string?][] = [
    ['Trip total', eur(sum.total)], ['Avg per person', eur(sum.avg)], ['Prepaid collected', eur(sum.prepaidCollected)], ['Your share', eur(sum.byMember[ME]), 'charged to PayPal'],
  ];
  return (
    <>
      <ScreenTitle title="Insights" />
      <ScrollView contentContainerStyle={s.pad}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tiles.map(([l, v, sub], k) => (
            <View key={l} style={{ width: '48%', flexGrow: 1, padding: 14, borderRadius: 14, gap: 4, backgroundColor: k === 3 ? c.ink : '#fff', borderWidth: k === 3 ? 0 : 1, borderColor: c.line }}>
              <Text style={[s.small, k === 3 && { color: '#C9CCD1' }]}>{l}</Text>
              <Text style={[s.mono, { fontSize: 18 }, k === 3 && { color: c.bg }]}>{v}</Text>
              {sub && <Text style={[s.small, { color: '#C9CCD1', fontSize: 12 }]}>{sub}</Text>}
            </View>
          ))}
        </View>
        <View style={s.card}>
          <Text style={s.h2}>Spend per member</Text>
          {members.map((m, i) => (
            <View key={m.id} style={{ gap: 4 }}>
              <View style={s.between}>
                <Text style={s.text}><Text style={{ color: m.color }}>{m.symbol}</Text> {m.me ? 'You' : m.name}</Text>
                <Text style={[s.mono, { fontSize: 14 }]}>{eur(sum.byMember[i])}</Text>
              </View>
              <View style={[s.bar, { backgroundColor: 'transparent' }]}><View style={{ width: `${(sum.byMember[i] / maxMember) * 100}%`, backgroundColor: m.color, borderRadius: 999 }} /></View>
            </View>
          ))}
        </View>
        <View style={s.card}>
          <Text style={s.h2}>Spend per leg</Text>
          {legTotals.map((l) => (
            <View key={l.name} style={{ gap: 4 }}>
              <View style={s.between}>
                <Text style={s.text}>{l.name}{l.total ? '' : ' · nothing booked yet'}</Text>
                {l.total > 0 && <Text style={[s.mono, { fontSize: 14 }]}>{eur(l.total)}</Text>}
              </View>
              {l.total > 0 && (
                <View accessibilityLabel={`${l.name}: ${members.map((m, i) => `${m.name} ${eur(l.perMember[i])}`).join(', ')}`} style={[s.bar, { height: 14, gap: 2 }]}>
                  {members.map((m, i) => <View key={i} style={{ width: `${(l.perMember[i] / l.total) * 100}%`, backgroundColor: m.color }} />)}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
}
