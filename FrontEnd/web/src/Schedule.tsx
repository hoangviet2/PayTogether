import { useRef, useState, type FormEvent, type Ref } from 'react';
import { equalBps, largestRemainder, money, tripDays, type Trip, type Txn } from '../../shared/trip';
import type { Ctx } from './api';
import { Chip, Icon, icons } from './ui';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (iso: string) => WEEK[new Date(iso + 'T00:00:00Z').getUTCDay()];
const short = (iso: string) => `${weekday(iso)} ${Number(iso.slice(8))}`;
const legOn = (t: Trip, d: string) => t.legs.find((l) => d >= l.arrive_date && d < l.depart_date)?.destination.name ?? null;

const evtStyle = (t: Txn, c: string, tint: string) => {
  if (t.source !== 'Prepaid share' && t.source !== 'In-store') return { background: '#fff', borderColor: c, color: c };
  if (t.status === 'captured') return { background: tint, borderColor: c, color: '#012169' };
  return { background: '#fff', borderColor: c, borderStyle: 'dashed', color: '#012169' };
};

export function Schedule({ ctx }: { ctx: Ctx }) {
  const { trip } = ctx;
  const [logDay, setLogDay] = useState(trip.window?.start ?? '');
  const dlg = useRef<HTMLDialogElement>(null);
  if (!trip.window) return <section className="card"><h2 style={{ fontSize: 20 }}>Schedule</h2><p className="muted">The schedule appears once the group confirms dates with Wayfinder.</p></section>;
  const days = tripDays(trip);
  const openLog = (d: string) => { setLogDay(d); dlg.current?.showModal(); };

  return (
    <section className="card">
      <div className="between" style={{ alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 20 }}>Schedule</h2>
          <span className="small muted">Every transaction, per person. Double-click your own row to log an expense.</span>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => openLog(logDay || days[0])}><Icon d={icons.plus} />Log expense</button>
        </div>
      </div>
      <Timeline ctx={ctx} days={days} onLog={openLog} />
      <LogExpense ref={dlg} ctx={ctx} day={logDay} onDone={() => dlg.current?.close()} />
    </section>
  );
}

function Timeline({ ctx, days, onLog }: { ctx: Ctx; days: string[]; onLog: (d: string) => void }) {
  const { trip, me } = ctx;
  const cols = `170px repeat(${days.length}, minmax(84px, 1fr))`;
  const place = (d: string, span = 1) => {
    const k = Math.max(0, days.indexOf(d));
    return { gridColumn: `${k + 1} / span ${Math.max(1, Math.min(span, days.length - k))}` };
  };
  const lane = { gridColumn: '2 / -1', display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridAutoFlow: 'dense' as const, alignContent: 'center', gap: 4, padding: '6px 0' };
  return (
    <>
      <div className="table-box">
        <div style={{ minWidth: 170 + days.length * 84, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
            <span style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--body)' }}>Who</span>
            {days.map((d) => <span key={d} style={{ padding: 10, fontWeight: 600, color: 'var(--body)' }}>{short(d)}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--line-2)' }}>
            <span style={{ padding: '10px 12px', fontWeight: 600 }}>Group · legs</span>
            <div style={lane}>
              {trip.legs.map((l, k) => (
                <span key={l.id} className={`evt ${['tone-blue', 'tone-orange', 'tone-gray'][k % 3]}`} style={{ ...place(l.arrive_date, l.nights), borderColor: 'transparent' }}>
                  {l.destination.name} · {l.nights} nights
                </span>
              ))}
              {!trip.legs.length && <span className="small muted" style={{ gridColumn: '1 / -1', padding: '0 8px' }}>No legs yet</span>}
            </div>
          </div>
          {trip.members.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--line-2)', minHeight: 56, background: i === me ? 'var(--bg)' : undefined }}>
              <span className="row" style={{ padding: '10px 12px', gap: 8, fontWeight: 600 }}><Chip p={m} size={24} />{m.name}{i === me ? ' (you)' : ''}</span>
              <div style={{ ...lane, cursor: i === me ? 'copy' : undefined }}
                onDoubleClick={i === me ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onLog(days[Math.min(days.length - 1, Math.floor(((e.clientX - r.left) / r.width) * days.length))]);
                } : undefined}>
                {trip.txs.filter((t) => t.member === i && t.status !== 'failed').map((t) => {
                  const label = <>{t.vendor} · {money(t.amount, trip.currency)}{t.status === 'created' && ' · unpaid'}</>;
                  const props = { className: 'evt', style: { ...place(t.date, t.nights), ...evtStyle(t, m.color, m.tint) }, title: `${t.vendor} · ${money(t.amount, trip.currency)} · ${t.status}` };
                  // Payments (stays, in-store bills) open in Spending, where they're paid and tracked.
                  return t.source === 'Prepaid share' || t.source === 'In-store'
                    ? <a key={t.id} {...props} href={`#/trip/${trip.id}/spending`} style={{ ...props.style, textDecoration: 'none' }} title={`${props.title} · open in Spending`}>{label}</a>
                    : <span key={t.id} {...props}>{label}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="row small muted" style={{ flexWrap: 'wrap', gap: 16 }}>
        <span>Solid fill: paid · dashed: not paid yet · outline: logged expense. Click a payment to open it in Spending.</span>
        <span>Other members’ rows are read-only.</span>
      </div>
    </>
  );
}

function LogExpense({ ref, ctx, day, onDone }: { ref: Ref<HTMLDialogElement>; ctx: Ctx; day: string; onDone: () => void }) {
  const { trip, me, act } = ctx;
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'me' | 'equal'>('equal');
  const [picked, setPicked] = useState<number[]>(trip.members.map((_, i) => i));
  const cents = Math.round(parseFloat(amount) * 100);
  const valid = Number.isFinite(cents) && cents > 0;
  const who = mode === 'me' ? [me] : picked;
  const shares = valid && who.length ? largestRemainder(cents, who.map(() => 1)) : [];

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid || !who.length) return;
    const f = new FormData(e.currentTarget);
    const eq = equalBps(who.length);
    const bps = trip.members.map((_, i) => (who.includes(i) ? eq[who.indexOf(i)] : 0));
    await act('/txns', { date: day, time: String(f.get('time') || '12:00'), vendor: String(f.get('vendor')).trim(), type: String(f.get('type')), total: cents, bps });
    e.currentTarget.reset();
    setAmount('');
    onDone();
  };

  return (
    <dialog ref={ref} aria-labelledby="log-h">
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div className="col">
          <h2 id="log-h" style={{ fontSize: 20 }}>Log expense</h2>
          <span className="small muted">{day && `${short(day)} · ${legOn(trip, day) ?? ''}`}</span>
        </div>
        <label className="field">Vendor<input name="vendor" required maxLength={60} /></label>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>Type
            <select name="type">{['Restaurant', 'Hotel', 'Store', 'Transport', 'Other'].map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field" style={{ flex: 1 }}>Amount ({trip.currency})<input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} pattern="\d+(\.\d{1,2})?" /></label>
          <label className="field" style={{ width: 110 }}>Time<input name="time" type="time" defaultValue="20:00" /></label>
        </div>
        <div className="field">Who paid<span className="row" style={{ fontWeight: 400, fontSize: 15, color: 'var(--ink)' }}><Chip p={trip.members[me]} size={24} />{trip.members[me].name} (you)</span></div>
        {!trip.solo && <fieldset className="col" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
          <legend className="field" style={{ marginBottom: 6 }}>Split with</legend>
          <div role="group" className="seg" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={mode === 'me'} onClick={() => setMode('me')}>Me only</button>
            <button type="button" aria-pressed={mode === 'equal'} onClick={() => setMode('equal')}>Equal among selected</button>
          </div>
          {mode === 'equal' && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {trip.members.map((m, i) => (
                <label key={i} className="row" style={{ gap: 4, fontSize: 14, minHeight: 44 }}>
                  <input type="checkbox" checked={picked.includes(i)} onChange={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort()))} />
                  <span style={{ color: m.color }}>{m.symbol}</span>{m.name}
                </label>
              ))}
            </div>
          )}
          <span className="small muted">
            {who.length} selected{valid && who.length ? ` · ${money(shares[0], trip.currency)}${new Set(shares).size > 1 ? ' or less' : ''} each` : ''}. You paid; the others owe you their share (see Dashboard → settle up).
          </span>
        </fieldset>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onDone}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!valid || !who.length}>Save expense</button>
        </div>
      </form>
    </dialog>
  );
}
