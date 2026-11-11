import { useRef, useState, type FormEvent, type Ref } from 'react';
import { money, payStage, tripDays, type Trip, type Txn } from '../../shared/trip';
import type { Ctx } from './api';
import { Chip, Icon, icons } from './ui';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (iso: string) => WEEK[new Date(iso + 'T00:00:00Z').getUTCDay()];
const short = (iso: string) => `${weekday(iso)} ${Number(iso.slice(8))}`;
const legOn = (t: Trip, d: string) => t.legs.find((l) => d >= l.arrive_date && d < l.depart_date)?.destination.name ?? null;

const isPayment = (t: Txn) => t.source !== 'On-trip log';
// Same solid border for every block, however it was added; only the fill and the label show the payment status.
const evtStyle = (t: Txn, c: string, tint: string) => ({ background: payStage(t.status) === 'Paid' ? tint : '#fff', borderColor: c, color: '#012169' });

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
      <LogExpense ref={dlg} ctx={ctx} day={logDay} days={days} onDone={() => dlg.current?.close()} />
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
                  const label = <>{t.vendor} · {money(t.amount, trip.currency)} · {payStage(t.status)}</>;
                  const props = { className: 'evt', style: { ...place(t.date, t.nights), ...evtStyle(t, m.color, m.tint) }, title: `${t.vendor} · ${money(t.amount, trip.currency)} · ${payStage(t.status)}${isPayment(t) ? '' : ' · logged expense'}` };
                  // Payments (stays, in-store bills) open in Spending, where they're paid and tracked.
                  return isPayment(t)
                    ? <a key={t.id} {...props} href={`#/trip/${trip.id}/spending`} style={{ ...props.style, textDecoration: 'none' }} title={`${props.title} · open in Spending`}>{label}</a>
                    : <span key={t.id} {...props}>{label}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="row small muted" style={{ flexWrap: 'wrap', gap: 16 }}>
        <span>Filled = paid · white = awaiting payment or verifying (the label says which). Click a payment to open it in Spending.</span>
        <span>Other members’ rows are read-only.</span>
      </div>
    </>
  );
}

/** Log expense: the details only. Saving makes a bill in Split bills (Spending), where everyone sets their own share. */
function LogExpense({ ref, ctx, day, days, onDone }: { ref: Ref<HTMLDialogElement>; ctx: Ctx; day: string; days: string[]; onDone: () => void }) {
  const { trip, act } = ctx;
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(day);
  const [seenDay, setSeenDay] = useState(day);
  if (day !== seenDay) { setSeenDay(day); setDate(day); } // a double-click on another day opens the dialog on that day
  const [paid, setPaid] = useState(true);
  const [onlyMe, setOnlyMe] = useState(false); // 100% mine: skips Split bills
  const solo = trip.solo || onlyMe;
  const cents = Math.round(parseFloat(amount) * 100);
  const valid = Number.isFinite(cents) && cents > 0;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    await act('/txns', { date, time: String(f.get('time') || '12:00'), vendor: String(f.get('vendor')).trim(), type: String(f.get('type')), total: cents, paid, only_me: onlyMe });
    form.reset();
    setAmount('');
    onDone();
    location.hash = `#/trip/${trip.id}/spending`; // Split bills is at the top of Spending
  };

  return (
    <dialog ref={ref} aria-labelledby="log-h">
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div className="col">
          <h2 id="log-h" style={{ fontSize: 20 }}>Log expense</h2>
          <span className="small muted">{date && `${short(date)} · ${legOn(trip, date) ?? ''}`}</span>
        </div>
        <div role="group" aria-label="Has it been paid?" className="seg" style={{ alignSelf: 'flex-start' }}>
          <button type="button" aria-pressed={paid} onClick={() => setPaid(true)}>Already paid</button>
          <button type="button" aria-pressed={!paid} onClick={() => setPaid(false)}>Just planned</button>
        </div>
        {!trip.solo && (
          <div role="group" aria-label="Who is it for?" className="seg" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={!onlyMe} onClick={() => setOnlyMe(false)}>Split with the group</button>
            <button type="button" aria-pressed={onlyMe} onClick={() => setOnlyMe(true)}>Only me</button>
          </div>
        )}
        <label className="field">Vendor<input name="vendor" required maxLength={60} /></label>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 140px' }}>Date<input type="date" required value={date} min={days[0]} max={days.at(-1)} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field" style={{ width: 110 }}>Time<input name="time" type="time" defaultValue="20:00" /></label>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 140px' }}>Type
            <select name="type">{['Restaurant', 'Hotel', 'Store', 'Transport', 'Tickets', 'Other'].map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field" style={{ flex: '1 1 140px' }}>Amount ({trip.currency})<input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} pattern="\d+(\.\d{1,2})?" /></label>
        </div>
        <span className="small muted">{solo
          ? (paid ? `It's 100% yours and goes straight to the Spending list.` : `It's 100% yours and goes straight to Payments due on Spending, to pay in advance with PayPal.`)
          : `Next, it opens in Split bills on Spending, starting equal; everyone sets their own share there and accepts. ${paid
            ? 'Once everyone accepts it goes to the Spending list; the others owe you their share.'
            : 'Once everyone accepts, each pays their share in advance with PayPal.'}`}</span>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onDone}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>{!solo ? 'Continue to split bill' : paid ? 'Save expense' : 'Add to Payments due'}</button>
        </div>
      </form>
    </dialog>
  );
}
