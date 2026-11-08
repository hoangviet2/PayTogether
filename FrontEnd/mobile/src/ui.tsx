import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Path } from 'react-native-svg';
import { members, displayName, eur, pct, billView, setShare, toggleLock, splitEqually, primaryAction, type Bill } from '../../shared/trip';

export const c = {
  ink: '#012169', brand: '#003087', sky: '#009CDE', bg: '#F6F7F8', card: '#FFFFFF', line: '#DDE2E8', line2: '#E9ECF0',
  input: '#C5CCD6', muted: '#5B6068', body: '#464B53', blueTint: '#E5F4FB', orangeTint: '#FDF1E2', orangeInk: '#8A4205', grayTint: '#EEF1F4',
};
// shortcut: system fonts; load Inter / Space Grotesk / IBM Plex Mono with expo-font to match web exactly.
export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  pad: { padding: 16, gap: 14, paddingBottom: 32 },
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  h1: { fontSize: 28, fontWeight: '700', color: c.ink, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '700', color: c.ink },
  text: { fontSize: 15, color: c.ink },
  small: { fontSize: 13, color: c.muted },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: c.muted },
  mono: { fontFamily: mono, color: c.ink },
  bar: { height: 8, borderRadius: 999, backgroundColor: c.line2, overflow: 'hidden', flexDirection: 'row' },
  input: { minHeight: 44, borderWidth: 1, borderColor: c.input, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: c.ink, backgroundColor: '#fff' },
});

export const icons = {
  chat: 'M4 5h16v11H9l-5 4z',
  plan: 'M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4',
  schedule: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  spending: 'M4 6h16M4 12h16M4 18h16',
  insights: 'M5 20V11M12 20V5M19 20v-6',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 7.5-2',
  send: 'M4 12l16-8-6 16-2-7z',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 5l7 7-7 7',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
};
export const Icon = ({ d, size = 20, color = c.ink }: { d: string; size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d={d} />
  </Svg>
);

/** Member avatar: color plus symbol, never color alone. */
export const Chip = ({ i, size = 30 }: { i: number; size?: number }) => (
  <View accessibilityLabel={displayName(i)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: members[i].color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontSize: size * 0.42 }}>{members[i].symbol}</Text>
  </View>
);

export function Btn({ label, onPress, kind = 'primary', style, icon, selected }: {
  label: string; onPress?: () => void; kind?: 'primary' | 'outline' | 'ghost'; style?: StyleProp<ViewStyle>; icon?: string; selected?: boolean;
}) {
  const on = kind === 'primary' && !selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed ? 0.8 : 1 },
        on ? { backgroundColor: c.brand } : selected ? { backgroundColor: c.blueTint, borderWidth: 1, borderColor: c.brand } : { backgroundColor: '#fff', borderWidth: 1, borderColor: kind === 'outline' ? c.ink : c.input },
        style,
      ]}
    >
      {icon && <Icon d={icon} size={18} color={on ? '#fff' : c.brand} />}
      <Text style={{ fontSize: 15, fontWeight: '600', color: on ? '#fff' : selected ? c.brand : c.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.input, borderRadius: 10, overflow: 'hidden' }}>
      {options.map(([id, label]) => (
        <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: value === id }} onPress={() => onChange(id)}
          style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: value === id ? c.ink : '#fff' }}>
          <Text style={{ fontSize: 14, color: value === id ? '#fff' : c.ink, fontWeight: value === id ? '600' : '400' }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const Pill = ({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'orange' | 'gray' }) => (
  <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: tone === 'orange' ? c.orangeTint : tone === 'gray' ? c.line2 : c.blueTint }}>
    <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: tone === 'orange' ? c.orangeInk : tone === 'gray' ? c.body : c.ink }}>{label}</Text>
  </View>
);

export function ScreenTitle({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={[s.between, { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: c.line }]}>
      <View style={[s.row, { flex: 1 }]}>
        {onBack && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 }}>
            <Icon d={icons.back} size={22} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[s.h2, { fontSize: 22 }]}>{title}</Text>
          {sub && <Text style={s.small}>{sub}</Text>}
        </View>
      </View>
      {right}
    </View>
  );
}

export type Tab = 'chat' | 'plan' | 'schedule' | 'spending' | 'insights';
const TABS: [Tab, string][] = [['chat', 'Chat'], ['plan', 'Plan'], ['schedule', 'Schedule'], ['spending', 'Spending'], ['insights', 'Insights']];
export function TabBar({ active, onChange }: { active: string; onChange: (t: Tab) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: c.line, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 6 }}>
      {TABS.map(([id, label]) => {
        const on = id === active;
        return (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(id)}
            style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 12, backgroundColor: on ? c.blueTint : 'transparent' }}>
            <Icon d={icons[id]} size={22} color={on ? c.brand : c.muted} />
            <Text style={{ fontSize: 11, fontWeight: on ? '700' : '500', color: on ? c.brand : c.muted }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SplitEditor({ bill, onChange }: { bill: Bill; onChange: (b: Bill) => void }) {
  const v = billView(bill);
  return (
    <View style={s.card} accessibilityLabel={`${bill.title} split`}>
      <View style={[s.between, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.eyebrow}>{bill.kind}</Text>
          <Text style={[s.h2, { fontSize: 20 }]}>{bill.title}</Text>
          <Text style={s.small}>{bill.meta}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={[s.mono, { fontSize: 20 }]}>{eur(bill.total)}</Text>
          <Pill label={v.pill} tone={bill.frozen ? 'orange' : 'blue'} />
        </View>
      </View>
      <View accessibilityLabel={members.map((m, i) => `${m.name} ${pct(bill.bps[i])}`).join(', ')} style={[s.bar, { height: 14, gap: 2 }]}>
        {members.map((m, i) => <View key={i} style={{ width: `${bill.bps[i] / 100}%`, backgroundColor: m.color }} />)}
      </View>
      {members.map((m, i) => {
        const off = bill.frozen || bill.locked[i];
        return (
          <View key={i} style={{ gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: m.me ? c.line : 'transparent', backgroundColor: m.me ? c.bg : 'transparent' }}>
            <View style={s.row}>
              <Chip i={i} />
              <View style={{ flex: 1 }}>
                <Text style={[s.text, { fontWeight: '600', fontSize: 14 }]}>{displayName(i)}</Text>
                <Text style={[s.small, { fontSize: 12 }]}>{v.note(i)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.mono, { fontSize: 14 }]}>{pct(bill.bps[i])}</Text>
                <Text style={[s.mono, { fontSize: 13, color: c.body }]}>{eur(v.cents[i])}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`${bill.locked[i] ? 'Unlock' : 'Lock'} ${m.name}’s share`} accessibilityState={{ selected: bill.locked[i], disabled: bill.frozen }}
                disabled={bill.frozen} onPress={() => onChange(toggleLock(bill, i))}
                style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: bill.locked[i] ? c.ink : c.input, backgroundColor: bill.locked[i] ? c.ink : '#fff' }}>
                <Icon d={bill.locked[i] ? icons.lock : icons.unlock} size={16} color={bill.locked[i] ? '#fff' : c.muted} />
              </Pressable>
            </View>
            <Slider
              style={{ height: 36, opacity: off ? 0.55 : 1 }}
              minimumValue={0} maximumValue={10000} step={50} value={bill.bps[i]} disabled={off}
              minimumTrackTintColor={m.color} maximumTrackTintColor={c.line} thumbTintColor={m.color}
              accessibilityLabel={`${m.name} share, 0 to 100 percent`}
              onValueChange={(val) => onChange(setShare(bill, i, val))}
            />
          </View>
        );
      })}
      {bill.frozen && (
        <Text style={[s.small, { color: c.body, backgroundColor: c.grayTint, borderRadius: 10, padding: 10, lineHeight: 19 }]}>
          Bars are locked while PayPal collects — everyone accepted these ratios before the orders went out.
        </Text>
      )}
      <Text style={s.small}>{v.foot}</Text>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {!bill.frozen && <Btn kind="ghost" label="Split equally" onPress={() => onChange(splitEqually(bill))} />}
        <Btn label={v.primaryLabel} selected={v.done} onPress={() => onChange(primaryAction(bill))} style={{ flex: 1, minHeight: 48 }} />
      </View>
    </View>
  );
}
