import { useMemo, useRef, useState, type FormEvent, type Ref } from 'react';
import { BryntumScheduler } from '@bryntum/scheduler-react-enterprise';
import { StringHelper } from '@bryntum/core-enterprise';
import type { Scheduler } from '@bryntum/scheduler-enterprise';
import './bryntum.css';
import { money, payStage, tripDays, type Trip, type Txn } from '../../shared/trip';
import type { Ctx } from './api';
import { Icon, icons } from './ui';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (iso: string) => WEEK[new Date(iso + 'T00:00:00Z').getUTCDay()];
const short = (iso: string) => `${weekday(iso)} ${Number(iso.slice(8))}`;
const legOn = (t: Trip, d: string) => t.legs.find((l) => d >= l.arrive_date && d < l.depart_date)?.destination.name ?? null;

const isPayment = (t: Txn) => t.source !== 'On-trip log';

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

const day = (iso: string) => new Date(`${iso}T00:00:00`); // trip days are local calendar dates
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso_: string, n: number) => { const d = day(iso_); d.setDate(d.getDate() + n); return d; };

/** Bryntum Scheduler: a top row for the stops, then one row per member with their transactions across the trip days.
 * Read-only: changes happen in Log expense and Spending. Double-click your own row to log on that day. */
function Timeline({ ctx, days, onLog }: { ctx: Ctx; days: string[]; onLog: (d: string) => void }) {
  const { trip, me } = ctx;
  const resources = useMemo(() => [
    { id: 'legs', name: 'Group · stops' },
    ...trip.members.map((m, i) => ({ id: `m${i}`, name: `${m.symbol} ${m.name}${i === me ? ' (you)' : ''}`, eventColor: m.color })),
  ], [trip.members, me]);
  const txs = useMemo(() => new Map(trip.txs.map((t) => [`tx:${t.id}`, t])), [trip.txs]);
  const events = useMemo(() => [
    ...trip.legs.map((l) => ({
      id: `leg:${l.id}`, resourceId: 'legs', name: `${l.destination.name} · ${l.nights} nights`,
      startDate: day(l.arrive_date), endDate: day(l.depart_date), eventColor: '#003087',
    })),
    ...trip.txs.map((t) => ({
      id: `tx:${t.id}`, resourceId: `m${t.member}`, name: `${t.vendor} · ${money(t.amount, trip.currency)} · ${payStage(t.status)}`,
      startDate: day(t.date), endDate: addDays(t.date, t.nights ?? 1),
      eventColor: trip.members[t.member]?.color,
    })),
  ], [trip.legs, trip.txs, trip.members, trip.currency]);
  const columns = useMemo(() => [{ text: 'Who', field: 'name', width: 170 }], []);
  // Shop items and Pay at a store are dated the day they're bought, often before or after the trip: widen the range to show them.
  const first = [days[0], ...trip.txs.map((t) => t.date)].sort()[0];
  const last = trip.txs.reduce((a, t) => (iso(addDays(t.date, t.nights ?? 1)) > a ? iso(addDays(t.date, t.nights ?? 1)) : a), iso(addDays(days.at(-1)!, 1)));

  return (
    <>
      <div className="table-box">
        <BryntumScheduler
          autoHeight
          readOnly
          viewPreset="dayAndMonth"
          startDate={day(first)}
          endDate={day(last)}
          rowHeight={52}
          barMargin={6}
          columns={columns}
          resources={resources}
          events={events}
          eventDragFeature={false}
          eventResizeFeature={false}
          eventDragCreateFeature={false}
          eventEditFeature={false}
          taskEditFeature={false}
          eventMenuFeature={false}
          scheduleMenuFeature={false}
          cellMenuFeature={false}
          headerMenuFeature={false}
          zoomOnMouseWheel={false}
          zoomOnTimeAxisDoubleClick={false}
          onPaint={({ source, firstPaint }) => { if (firstPaint) (source as Scheduler).scrollToDate(day(days[0]), { block: 'start' }); }} // open on the trip, not on early purchases
          eventRenderer={({ eventRecord, renderData }) => {
            // Stops tonal; payments filled once paid, outlined while awaiting payment or verifying (the label says which).
            const t = txs.get(String(eventRecord.id));
            renderData.eventStyle = !t ? 'tonal' : payStage(t.status) === 'Paid' ? 'filled' : 'outlined';
            renderData.iconCls = '';
            return StringHelper.encodeHtml(eventRecord.name); // vendor names are user input
          }}
          onEventClick={({ eventRecord }) => {
            const t = txs.get(String(eventRecord.id));
            if (t && isPayment(t)) location.hash = `#/trip/${trip.id}/spending`; // payments are paid and tracked in Spending
          }}
          onScheduleDblClick={({ resourceRecord, date }) => { if (resourceRecord.id === `m${me}`) onLog(iso(date)); }}
        />
      </div>
      <div className="row small muted" style={{ flexWrap: 'wrap', gap: 16 }}>
        <span>Filled = paid · outlined = awaiting payment or verifying (the label says which). Click a payment to open it in Spending.</span>
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
