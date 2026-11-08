import { useRef, useState, type FormEvent, type Ref } from 'react';
import { members, displayName, eur, legs, legOf, largestRemainder, mayGrid, planned, trip, ME, type Tx } from '../../shared/trip';
import { Chip, Icon, icons } from './ui';

const DAYS = Array.from({ length: trip.lastDay - trip.firstDay + 1 }, (_, k) => trip.firstDay + k);
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (d: number) => WEEK[new Date(Date.UTC(2027, 4, d)).getUTCDay()];
const cols = `170px repeat(${DAYS.length}, minmax(84px, 1fr))`;

const evtStyle = (t: Tx) => {
  const c = members[t.member].color;
  if (t.status === 'logged' || t.source !== 'Prepaid share') return { background: '#fff', borderColor: c, color: c };
  if (t.status === 'captured') return { background: members[t.member].tint, borderColor: c, color: '#012169' };
  return { background: '#fff', borderColor: c, borderStyle: 'dashed', color: '#012169' };
};

export function Schedule({ txs, addTx }: { txs: Tx[]; addTx: (t: Tx) => void }) {
  const [view, setView] = useState<'timeline' | 'calendar'>('timeline');
  const [logDay, setLogDay] = useState(18);
  const dlg = useRef<HTMLDialogElement>(null);
  const openLog = (d: number) => { setLogDay(d); dlg.current?.showModal(); };

  return (
    <section className="card">
      <div className="between" style={{ alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 20 }}>Schedule</h2>
          <span className="small muted">Every transaction, per person. Double-click your own row to log an expense.</span>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div role="group" aria-label="View" className="seg">
            <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Timeline</button>
            <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openLog(logDay)}><Icon d={icons.plus} />Log expense</button>
        </div>
      </div>
      {view === 'timeline' ? <Timeline txs={txs} onLog={openLog} /> : <Calendar txs={txs} />}
      <LogExpense ref={dlg} day={logDay} onSave={(rows) => { rows.forEach(addTx); dlg.current?.close(); }} onCancel={() => dlg.current?.close()} />
    </section>
  );
}

function Timeline({ txs, onLog }: { txs: Tx[]; onLog: (d: number) => void }) {
  const place = (day: number, span = 1) => ({ gridColumn: `${day - trip.firstDay + 1} / span ${Math.min(span, trip.lastDay - day + 1)}` });
  const lane = { gridColumn: '2 / -1', display: 'grid', gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))`, gridAutoFlow: 'dense' as const, alignContent: 'center', gap: 4, padding: '6px 0' };
  return (
    <>
      <div className="table-box">
        <div style={{ minWidth: 1000, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
            <span className="who" style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--body)' }}>Who</span>
            {DAYS.map((d) => <span key={d} style={{ padding: 10, fontWeight: 600, color: 'var(--body)' }}>{weekday(d)} {d}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--line-2)' }}>
            <span style={{ padding: '10px 12px', fontWeight: 600 }}>Group · legs</span>
            <div style={lane}>
              {legs.map((l) => (
                <span key={l.name} className={`evt tone-${l.tone}`} style={{ ...place(l.from, l.nights + (l.to === trip.lastDay ? 1 : 0)), borderColor: 'transparent' }}>
                  {l.name} · {l.nights} nights{l.tone === 'gray' ? ' · stay poll open' : ''}
                </span>
              ))}
            </div>
          </div>
          {members.map((m, i) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--line-2)', minHeight: 56, background: m.me ? 'var(--bg)' : undefined }}>
              <span className="row" style={{ padding: '10px 12px', gap: 8, fontWeight: 600 }}><Chip i={i} size={24} />{displayName(i)}</span>
              <div
                style={{ ...lane, cursor: m.me ? 'copy' : undefined }}
                onDoubleClick={m.me ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onLog(trip.firstDay + Math.floor(((e.clientX - r.left) / r.width) * DAYS.length));
                } : undefined}
              >
                {txs.filter((t) => t.member === i).map((t, k) => (
                  <span key={k} className="evt" style={{ ...place(t.day, t.nights), ...evtStyle(t) }} title={`${t.vendor} · ${eur(t.amount)} · ${t.status}`}>
                    {t.vendor} · {eur(t.amount)}
                    {t.status === 'created' && ' · unpaid'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="row small muted" style={{ flexWrap: 'wrap', gap: 16 }}>
        <span className="row" style={{ gap: 6 }}><span className="evt" style={{ width: 20, height: 12, padding: 0, background: '#EEDFF9', borderColor: '#7E22CE' }} />Paid prepaid share</span>
        <span className="row" style={{ gap: 6 }}><span className="evt" style={{ width: 20, height: 12, padding: 0, borderColor: '#7E22CE', borderStyle: 'dashed' }} />Collecting</span>
        <span className="row" style={{ gap: 6 }}><span className="evt" style={{ width: 20, height: 12, padding: 0, background: '#fff', borderColor: '#5B6068' }} />On-trip log or online purchase</span>
        <span>Other members’ rows are read-only.</span>
      </div>
    </>
  );
}

function Calendar({ txs }: { txs: Tx[] }) {
  const [sel, setSel] = useState(17);
  const dayEvents = (d: number) => {
    const byVendor = new Map<string, Tx[]>();
    txs.filter((t) => t.day === d).forEach((t) => byVendor.set(t.vendor, [...(byVendor.get(t.vendor) ?? []), t]));
    return [...byVendor.entries()].map(([vendor, rows]) => ({
      vendor, rows,
      who: rows.length > 1 ? null : rows[0].member,
      label: `${vendor} · ${eur(rows.reduce((a, t) => a + t.amount, 0))}`,
    }));
  };
  const items = txs.filter((t) => t.day === sel);
  const extra = planned.filter((p) => p.day === sel);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: '3 1 560px', minWidth: 0 }} className="col">
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>May 2027</h3>
        <div className="cal" role="grid" aria-label="May 2027">
          {WEEK.map((w) => <span key={w} className="small muted" style={{ fontWeight: 600, padding: 4 }}>{w}</span>)}
          {mayGrid().map((c, k) => {
            const evs = c.inMonth ? dayEvents(c.day) : [];
            const plans = c.inMonth ? planned.filter((p) => p.day === c.day) : [];
            const leg = c.inMonth && c.day >= trip.firstDay && c.day <= trip.lastDay ? legOf(c.day) : null;
            return (
              <button key={k} type="button" className={c.inMonth ? '' : 'out'} disabled={!c.inMonth} aria-pressed={c.inMonth && c.day === sel}
                aria-label={`${c.inMonth ? 'May' : c.day > 20 ? 'April' : 'June'} ${c.day}${evs.length ? `, ${evs.length} items` : ''}`}
                onClick={() => setSel(c.day)}>
                <span className="row" style={{ justifyContent: 'space-between', gap: 4 }}>
                  <strong style={{ fontSize: 13 }}>{c.day}</strong>
                  {leg && <span className="muted" style={{ fontSize: 11 }}>{leg}</span>}
                </span>
                {evs.map((e) => (
                  <span key={e.vendor} className="tag" style={{ background: e.who === null ? 'var(--blue-tint)' : members[e.who].tint }}>
                    {e.who === null ? '◆▲●★' : members[e.who].symbol} {e.label}
                  </span>
                ))}
                {plans.map((p) => <span key={p.title} className="tag" style={{ border: '1px dashed var(--brand)' }}>{p.title.split(' —')[0]}</span>)}
              </button>
            );
          })}
        </div>
      </div>
      <aside className="card" style={{ flex: '1 1 280px', background: 'var(--bg)', padding: 18 }}>
        <div className="col">
          <h3 style={{ fontSize: 18 }}>{weekday(sel)}, May {sel}</h3>
          <span className="small muted">{legOf(sel) && sel <= trip.lastDay && sel >= trip.firstDay ? `${legOf(sel)} · ${items.length + extra.length} items` : 'Outside the trip'}</span>
        </div>
        {items.length + extra.length === 0 && <p className="small muted">No transactions on this day. Double-click a day in your row on Timeline, or use Log expense.</p>}
        {items.map((t, k) => (
          <div key={k} className="row" style={{ alignItems: 'flex-start' }}>
            <Chip i={t.member} size={28} />
            <div className="col" style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{t.vendor}{t.source === 'Prepaid share' ? ` — ${t.member === ME ? 'your' : `${members[t.member].name}’s`} share` : ''}</strong>
              <span className="small muted">{t.time} · {t.source} · {t.status}</span>
            </div>
            <span className="mono small">{eur(t.amount)}</span>
          </div>
        ))}
        {extra.map((p) => (
          <div key={p.title} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="chip" style={{ width: 28, height: 28, background: 'var(--brand)', fontSize: 12 }}>◆</span>
            <div className="col" style={{ flex: 1 }}>
              <strong style={{ fontSize: 14 }}>{p.title}</strong>
              <span className="small muted">{p.meta}</span>
            </div>
            <span className="mono small">{p.amount === null ? '—' : eur(p.amount)}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}

function LogExpense({ ref, day, onSave, onCancel }: { ref: Ref<HTMLDialogElement>; day: number; onSave: (t: Tx[]) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'me' | 'equal'>('equal');
  const [picked, setPicked] = useState<number[]>([0, 1, 2, 3]);
  const cents = Math.round(parseFloat(amount) * 100);
  const valid = Number.isFinite(cents) && cents > 0;
  const who = mode === 'me' ? [ME] : picked;
  const shares = valid && who.length ? largestRemainder(cents, who.map(() => 1)) : [];

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!valid || !who.length) return;
    const leg = legOf(day) ?? 'Barcelona';
    // One transactions row per member per money event (claudee.md conventions).
    onSave(who.map((member, k) => ({
      member, day, time: String(f.get('time') || '12:00'), vendor: String(f.get('vendor') || 'Expense').trim(), type: String(f.get('type')),
      leg: `${leg} · leg ${legs.findIndex((l) => l.name === leg) + 1}`, amount: shares[k], total: cents,
      shareBp: largestRemainder(10000, who.map(() => 1))[k], source: 'On-trip log', status: 'logged',
    })));
    e.currentTarget.reset();
    setAmount('');
  };

  return (
    <dialog ref={ref} aria-labelledby="log-h">
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div className="col">
          <h2 id="log-h" style={{ fontSize: 20 }}>Log expense</h2>
          <span className="small muted">{weekday(day)} {day} · {legOf(day)}</span>
        </div>
        <label className="field">Vendor<input name="vendor" required /></label>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>Type
            <select name="type">{['Restaurant', 'Hotel', 'Store', 'Transport', 'Other'].map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field" style={{ flex: 1 }}>Amount (EUR)<input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} pattern="\d+(\.\d{1,2})?" /></label>
          <label className="field" style={{ width: 110 }}>Time<input name="time" type="time" defaultValue="20:00" /></label>
        </div>
        <div className="field">Who paid<span className="row" style={{ fontWeight: 400, fontSize: 15, color: 'var(--ink)' }}><Chip i={ME} size={24} />{displayName(ME)}</span></div>
        <fieldset className="col" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
          <legend className="field" style={{ marginBottom: 6 }}>Split with</legend>
          <div role="group" className="seg" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={mode === 'me'} onClick={() => setMode('me')}>Me only</button>
            <button type="button" aria-pressed={mode === 'equal'} onClick={() => setMode('equal')}>Equal among selected</button>
          </div>
          {mode === 'equal' && (
            <div className="row" style={{ gap: 8 }}>
              {members.map((m, i) => (
                <label key={m.id} className="row" style={{ gap: 4, fontSize: 14, minHeight: 44 }}>
                  <input type="checkbox" checked={picked.includes(i)} onChange={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort()))} />
                  <span style={{ color: m.color }}>{m.symbol}</span>{m.name}
                </label>
              ))}
            </div>
          )}
          <span className="small muted">
            {who.length} selected{valid && who.length ? ` · ${eur(shares[0])}${new Set(shares).size > 1 ? ' or less' : ''} each` : ''}. Each person’s share is charged to their PayPal automatically.
          </span>
        </fieldset>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!valid || !who.length}>Save expense</button>
        </div>
      </form>
    </dialog>
  );
}
