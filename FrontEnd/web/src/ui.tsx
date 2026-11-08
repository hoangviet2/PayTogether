import { useState, type FormEvent } from 'react';
import { members, displayName, eur, pct, trip, billView, setShare, toggleLock, splitEqually, primaryAction, ME, type Bill, type ChatMsg } from '../../shared/trip';

export const Logo = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
    <rect width="30" height="30" rx="8" fill="#003087" />
    <circle cx="12" cy="15" r="5.5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
    <circle cx="18" cy="15" r="5.5" fill="none" stroke="#009CDE" strokeWidth="2.4" />
  </svg>
);

export const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const icons = {
  plus: 'M12 5v14M5 12h14',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 7.5-2',
  send: 'M4 12l16-8-6 16-2-7z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
};

/** Member avatar: color plus symbol, never color alone (invariant 10). */
export const Chip = ({ i, size = 32, ring }: { i: number; size?: number; ring?: boolean }) => (
  <span
    className="chip"
    title={displayName(i)}
    style={{ width: size, height: size, background: members[i].color, fontSize: size * 0.42, border: ring ? '2px solid #fff' : undefined }}
  >
    {members[i].symbol}
  </span>
);

export function TripHeader({ active }: { active: string }) {
  const tabs = ['plan', 'schedule', 'spending', 'dashboard', 'shop'];
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '14px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="between" style={{ alignItems: 'center' }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
            <a href="#/trips" aria-label="Back to your trips" style={{ display: 'flex', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Logo size={28} />
            </a>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 22 }}>{trip.name}</span>
              <span className="small muted">{trip.dates} · {trip.nights} nights · {trip.currency}</span>
            </div>
            <span className="pill pill-orange">{trip.phase}</span>
          </div>
          <div className="row">
            <div className="row" style={{ gap: 0 }} aria-label="Members: Maya, Alex, Sam, Priya (you)">
              {members.map((_, i) => (
                <span key={i} style={{ marginLeft: i ? -6 : 0 }}><Chip i={i} ring /></span>
              ))}
            </div>
            <button type="button" className="btn"><Icon d={icons.link} size={16} />Invite</button>
          </div>
        </div>
        <nav aria-label="Trip sections" className="tabs">
          {tabs.map((t) => (
            <a key={t} href={`#/trip/${t}`} aria-current={t === active ? 'page' : undefined}>{t[0].toUpperCase() + t.slice(1)}</a>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SplitEditor({ bill, onChange }: { bill: Bill; onChange: (b: Bill) => void }) {
  const v = billView(bill);
  return (
    <section aria-label={`${bill.title} split`} className="card" style={{ padding: 18 }}>
      <div className="between">
        <div className="col" style={{ gap: 3 }}>
          <span className="eyebrow" style={{ fontSize: 11 }}>{bill.kind}</span>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 20 }}>{bill.title}</span>
          <span className="small muted">{bill.meta}</span>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
          <span className="mono" style={{ fontSize: 22, fontWeight: 500 }}>{eur(bill.total)}</span>
          <span className={`pill ${bill.frozen ? 'pill-orange' : 'pill-blue'}`} style={{ fontSize: 11 }}>{v.pill}</span>
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <div role="img" aria-label={members.map((m, i) => `${m.name} ${pct(bill.bps[i])}`).join(', ')} className="bar" style={{ height: 14, gap: 2 }}>
          {members.map((m, i) => <span key={i} style={{ width: `${bill.bps[i] / 100}%`, background: m.color }} />)}
        </div>
        <div className="between mono muted" style={{ fontSize: 11 }}>
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
        </div>
      </div>
      <div className="col">
        {members.map((m, i) => (
          <div key={i} className={`split-row${m.me ? ' me' : ''}`}>
            <div className="row" style={{ gap: 10 }}>
              <Chip i={i} size={30} />
              <span className="col" style={{ flex: 1, gap: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{displayName(i)}</span>
                <span className="muted" style={{ fontSize: 12 }}>{v.note(i)}</span>
              </span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 500, minWidth: 64, textAlign: 'right' }}>{pct(bill.bps[i])}</span>
              <span className="mono" style={{ fontSize: 14, minWidth: 76, textAlign: 'right' }}>{eur(v.cents[i])}</span>
              <button type="button" className="lock" disabled={bill.frozen} aria-pressed={bill.locked[i]} aria-label={`${bill.locked[i] ? 'Unlock' : 'Lock'} ${m.name}’s share`} onClick={() => onChange(toggleLock(bill, i))}>
                <Icon d={bill.locked[i] ? icons.lock : icons.unlock} size={16} />
              </button>
            </div>
            <input
              type="range" min={0} max={10000} step={50} value={bill.bps[i]}
              disabled={bill.frozen || bill.locked[i]}
              aria-label={`${m.name} share, 0 to 100 percent`}
              aria-valuetext={pct(bill.bps[i])}
              style={{ accentColor: m.color }}
              onChange={(e) => onChange(setShare(bill, i, Number(e.target.value)))}
            />
          </div>
        ))}
      </div>
      {bill.frozen && (
        <p className="small" style={{ lineHeight: 1.5, color: 'var(--body)', background: 'var(--gray-tint)', borderRadius: 10, padding: '10px 12px' }}>
          Bars are locked while PayPal collects — everyone accepted these ratios before the orders went out.
        </p>
      )}
      <div className="between" style={{ alignItems: 'center', borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
        <span className="small muted">{v.foot}</span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {!bill.frozen && <button type="button" className="btn" onClick={() => onChange(splitEqually(bill))}>Split equally</button>}
          <button type="button" className={`btn ${v.done ? 'btn-on' : 'btn-primary'}`} style={{ minHeight: 48, fontSize: 15 }} aria-pressed={v.done} onClick={() => onChange(primaryAction(bill))}>
            {v.primaryLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

export function Chat({ messages, onSend }: { messages: ChatMsg[]; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onSend(text.trim());
    setText('');
  };
  return (
    <section aria-label="Group chat" className="chat">
      <div className="between" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 17 }}>Group chat</span>
          <span className="small muted">4 members · 3 online</span>
        </div>
        <span className="row small" style={{ gap: 6, background: 'var(--blue-tint)', padding: '5px 10px', borderRadius: 999 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />Wayfinder active
        </span>
      </div>
      <div role="log" aria-live="polite" className="chat-log">
        <div className="mono muted" style={{ alignSelf: 'center', fontSize: 12 }}>Today</div>
        {messages.map((m, k) =>
          m.from === ME ? (
            <div key={k} className="msg msg-me">
              <div className="col" style={{ alignItems: 'flex-end', maxWidth: '80%' }}>
                <span className="small muted">You · {m.time}</span>
                <p>{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={k} className="msg">
              {m.from === 'ai' ? <span className="ai-badge"><Icon d={icons.compass} /></span> : <Chip i={m.from} />}
              <div className="col" style={{ gap: 8, minWidth: 0, flex: 1 }}>
                <span className="small"><strong>{m.from === 'ai' ? 'Wayfinder' : members[m.from].name}</strong> <span className="muted">· {m.time}</span></span>
                <p>{m.text}</p>
                {m.card === 'stay' && (
                  <div className="card" style={{ padding: 14, gap: 10, borderRadius: 14 }}>
                    <div className="between"><strong style={{ fontSize: 14 }}>Patio Azahar · 2 nights</strong><span className="mono" style={{ fontSize: 14 }}>€1,240.00</span></div>
                    <div className="row small muted" style={{ gap: 6 }}>
                      <span style={{ color: members[0].color }}>◆</span><span style={{ color: members[1].color }}>▲</span>paid
                      <span style={{ color: members[2].color, marginLeft: 8 }}>●</span>approved
                      <span style={{ color: members[3].color, marginLeft: 8 }}>★</span>you
                    </div>
                    <a href="#/trip/plan" className="btn btn-primary" style={{ fontSize: 15 }}>Open Split bills</a>
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>
      <form onSubmit={submit} className="row" style={{ padding: 12, borderTop: '1px solid var(--line-2)', gap: 8 }}>
        <label htmlFor="msg" className="sr-only">Message</label>
        <input id="msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the group, or ask @Wayfinder"
          style={{ flex: 1, minWidth: 0, minHeight: 44, border: '1px solid var(--input)', borderRadius: 12, padding: '0 14px', fontSize: 15 }} />
        <button type="submit" aria-label="Send message" className="btn btn-primary" style={{ width: 44, padding: 0, borderRadius: 12, background: 'var(--ink)' }}>
          <Icon d={icons.send} />
        </button>
      </form>
    </section>
  );
}
