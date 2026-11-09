import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CONFIRM_LABEL, PHASES, PHASE_LABEL, confirmBlocker, money, pct, ratioSum, shareAmounts,
  type Person, type Preview, type Share,
} from '../../shared/trip';
import { api, useConfig, type Ctx } from './api';

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
  send: 'M4 12l16-8-6 16-2-7z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  check: 'M5 12l5 5L20 7',
};

/** Member avatar: color plus symbol, never color alone (invariant 10). */
export const Chip = ({ p, size = 32, ring }: { p: Person; size?: number; ring?: boolean }) => (
  <span className="chip" title={p.name} style={{ width: size, height: size, background: p.color, fontSize: size * 0.42, border: ring ? '2px solid #fff' : undefined }}>
    {p.symbol}
  </span>
);

export function TripHeader({ ctx, active }: { ctx: Ctx; active: string }) {
  const { trip, me } = ctx;
  const [copied, setCopied] = useState(false);
  const tabs = ['plan', 'schedule', 'spending', 'dashboard', 'shop'];
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '14px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="between" style={{ alignItems: 'center' }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
            <a href="#/trips" aria-label="Back to your trips" style={{ display: 'flex', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Logo size={28} /></a>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 22 }}>{trip.name}</span>
              <span className="small muted">
                {trip.window ? `${trip.window.start} → ${trip.window.end}` : 'Dates not set'} · {trip.members.length} members · {trip.currency}
              </span>
            </div>
            <span className="pill pill-orange">{PHASE_LABEL[trip.phase]}</span>
          </div>
          <div className="row small" style={{ gap: 14, flexWrap: 'wrap' }}>
            {/* Friends log in with PayPal, then enter this code on the trips page. */}
            <button type="button" className="btn" style={{ minHeight: 40 }} aria-label={`Join code ${trip.code}, copy`}
              onClick={() => navigator.clipboard?.writeText(trip.code).then(() => setCopied(true), () => {})}>
              <span className="muted">Join code</span><span className="mono" style={{ fontWeight: 600, letterSpacing: '0.12em' }}>{trip.code}</span>
              <span className="muted" aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <span className="row" style={{ gap: 8 }}>
              <Chip p={trip.members[me]} size={28} />
              <span>{trip.members[me].name}{me === 0 ? ' (owner)' : ''}</span>
            </span>
          </div>
        </div>
        <nav aria-label="Trip sections" className="tabs">
          {tabs.map((t) => (
            <a key={t} href={`#/trip/${trip.id}/${t}`} aria-current={t === active ? 'page' : undefined}>{t[0].toUpperCase() + t.slice(1)}</a>
          ))}
        </nav>
      </div>
    </header>
  );
}

/** ai.md §2 state machine: where the group is, and the Confirm that moves it on (all members must confirm). */
export function PhaseBar({ ctx }: { ctx: Ctx }) {
  const { trip, me, act } = ctx;
  const at = PHASES.indexOf(trip.phase);
  const blocker = confirmBlocker(trip);
  const label = trip.phase === 'PRICING' && blocker ? null : CONFIRM_LABEL[trip.phase]; // prepaid trips book via payments, not a button
  const mine = trip.confirms.includes(me);
  return (
    <section className="card" aria-label="Planning progress" style={{ gap: 14 }}>
      <ol className="phases">
        {PHASES.map((p, k) => (
          <li key={p} aria-current={k === at ? 'step' : undefined} className={k < at ? 'done' : k === at ? 'now' : ''}>
            <span className="mono">{k < at ? '✓' : `0${k + 1}`}</span>{PHASE_LABEL[p]}
          </li>
        ))}
      </ol>
      {label && (
        <div className="between" style={{ alignItems: 'center' }}>
          <span className="small muted">
            {blocker ?? `${trip.confirms.length} of ${trip.members.length} confirmed. Everyone has to confirm to move on.`}
          </span>
          <div className="row" style={{ gap: 6 }}>
            {trip.confirms.map((i) => <Chip key={i} p={trip.members[i]} size={24} />)}
            <button type="button" className={`btn ${mine ? 'btn-on' : 'btn-primary'}`} disabled={!!blocker || mine} onClick={() => act('/confirm')}>
              {mine ? 'You confirmed' : label}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function Chat({ ctx }: { ctx: Ctx }) {
  const { trip, me, act } = ctx;
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [trip.chat.length, trip.busy]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) act('/messages', { text: text.trim() });
    setText('');
  };
  return (
    <section aria-label="Group chat" className="chat">
      <div className="between" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 17 }}>Group chat</span>
          <span className="small muted">{trip.members.map((m) => m.name).join(', ')}</span>
        </div>
        <span className="row small" style={{ gap: 6, background: 'var(--blue-tint)', padding: '5px 10px', borderRadius: 999 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />Wayfinder
        </span>
      </div>
      <div ref={log} role="log" aria-live="polite" className="chat-log">
        {trip.chat.map((m, k) => {
          const time = new Date(m.at).toTimeString().slice(0, 5);
          return m.from === me ? (
            <div key={k} className="msg msg-me">
              <div className="col" style={{ alignItems: 'flex-end', maxWidth: '80%' }}>
                <span className="small muted">You · {time}</span>
                <p>{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={k} className="msg">
              {m.from === 'ai' ? <span className="ai-badge"><Icon d={icons.compass} /></span> : <Chip p={trip.members[m.from]} />}
              <div className="col" style={{ gap: 8, minWidth: 0, flex: 1 }}>
                <span className="small"><strong>{m.from === 'ai' ? 'Wayfinder' : trip.members[m.from].name}</strong> <span className="muted">· {time}</span></span>
                <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
              </div>
            </div>
          );
        })}
        {trip.busy && <p className="small muted" style={{ alignSelf: 'flex-start' }}>Wayfinder is working…</p>}
      </div>
      <form onSubmit={submit} className="row" style={{ padding: 12, borderTop: '1px solid var(--line-2)', gap: 8 }}>
        <label htmlFor="msg" className="sr-only">Message</label>
        <input id="msg" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={trip.phase === 'DESTINATIONS' ? 'Where do you want to go, and when?' : 'Message the group, or ask @Wayfinder'}
          style={{ flex: 1, minWidth: 0, minHeight: 44, border: '1px solid var(--input)', borderRadius: 12, padding: '0 14px', fontSize: 15 }} />
        <button type="submit" aria-label="Send message" className="btn btn-primary" style={{ width: 44, padding: 0, borderRadius: 12, background: 'var(--ink)' }}>
          <Icon d={icons.send} />
        </button>
      </form>
    </section>
  );
}

const STATUS: Record<Share['status'], string> = { none: '', created: 'Awaiting payment', approved: 'Approved · capturing', captured: 'Paid', failed: 'Payment failed' };

/** Price preview with split bars. Each member moves only their own bar; ratios must reach exactly 100% (ai.md §2.4). */
export function PreviewCard({ ctx, p }: { ctx: Ctx; p: Preview }) {
  const { trip, me, act } = ctx;
  const cents = shareAmounts(p);
  const off = ratioSum(p) - 10000;
  const [draft, setDraft] = useState<number | null>(null);
  const mine = p.shares[me];
  const accepted = p.shares.filter((s) => s.accepted).length;
  return (
    <section aria-label={`${p.title} split`} className="card" style={{ padding: 18 }}>
      <div className="between">
        <div className="col" style={{ gap: 3 }}>
          <span className="eyebrow" style={{ fontSize: 11 }}>{p.kind === 'stay' ? 'Stay' : 'Dining'} · {p.prepaid ? 'prepaid' : 'pay there'}</span>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 20 }}>{p.title}</span>
          <span className="small muted">{p.meta}</span>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
          <span className="mono" style={{ fontSize: 22, fontWeight: 500 }}>{money(p.total_cents, p.currency)}</span>
          <span className={`pill ${p.frozen ? 'pill-orange' : 'pill-blue'}`} style={{ fontSize: 11 }}>{p.frozen ? 'Collecting' : 'Estimate'}</span>
        </div>
      </div>
      <div role="img" aria-label={p.shares.map((s, i) => `${trip.members[i].name} ${pct(s.ratio_bp)}`).join(', ')} className="bar" style={{ height: 14, gap: 2 }}>
        {p.shares.map((s, i) => <span key={i} style={{ width: `${s.ratio_bp / 100}%`, background: trip.members[i].color }} />)}
      </div>
      {off !== 0 && <p className="small" style={{ color: 'var(--orange-ink)' }}>Shares are {off > 0 ? 'over' : 'under'} 100% by {pct(Math.abs(off))}. Nobody can accept until they add up.</p>}
      <div className="col">
        {p.shares.map((s, i) => (
          <div key={i} className={`split-row${i === me ? ' me' : ''}`}>
            <div className="row" style={{ gap: 10 }}>
              <Chip p={trip.members[i]} size={30} />
              <span className="col" style={{ flex: 1, gap: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{trip.members[i].name}{i === me ? ' (you)' : ''}</span>
                <span className="muted" style={{ fontSize: 12 }}>{p.frozen ? STATUS[s.status] : s.accepted ? 'Accepted' : 'Not accepted yet'}</span>
              </span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 500, minWidth: 64, textAlign: 'right' }}>{pct(i === me && draft !== null ? draft : s.ratio_bp)}</span>
              <span className="mono" style={{ fontSize: 14, minWidth: 84, textAlign: 'right' }}>{cents ? money(cents[i], p.currency) : '—'}</span>
            </div>
            {i === me && !p.frozen && (
              <input type="range" min={0} max={10000} step={50} value={draft ?? s.ratio_bp} aria-label="Your share, 0 to 100 percent"
                aria-valuetext={pct(draft ?? s.ratio_bp)} style={{ accentColor: trip.members[i].color }}
                onChange={(e) => setDraft(Number(e.target.value))}
                onPointerUp={() => { if (draft !== null) act(`/previews/${p.id}/ratio`, { bp: draft }).then(() => setDraft(null)); }}
                onKeyUp={() => { if (draft !== null) act(`/previews/${p.id}/ratio`, { bp: draft }).then(() => setDraft(null)); }} />
            )}
          </div>
        ))}
      </div>
      <div className="between" style={{ alignItems: 'center', borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
        <span className="small muted">
          {p.frozen ? `${p.shares.filter((s) => s.status === 'captured').length} of ${p.shares.length} paid` : `${accepted} of ${p.shares.length} accepted`} · prices are estimates until booking
        </span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {!p.frozen && me === 0 && <button type="button" className="btn" onClick={() => act(`/previews/${p.id}/equal`)}>Reset to equal</button>}
          {!p.frozen && (
            <button type="button" className={`btn ${mine.accepted ? 'btn-on' : 'btn-primary'}`} disabled={!cents} aria-pressed={mine.accepted}
              onClick={() => act(`/previews/${p.id}/accept`)}>
              {mine.accepted ? 'Accepted' : cents ? `Accept ${money(cents[me], p.currency)}` : 'Accept'}
            </button>
          )}
          {p.frozen && mine.order_id && (mine.status === 'created' || mine.status === 'failed') && cents && (
            <PayShare ctx={ctx} previewId={p.id} orderId={mine.order_id} label={`Pay my share · ${money(cents[me], p.currency)}`} currency={p.currency} />
          )}
        </div>
      </div>
    </section>
  );
}

declare global {
  interface Window { paypal?: { Buttons: (o: object) => { render: (el: HTMLElement) => Promise<void>; close: () => Promise<void> } } }
}
const scripts = new Map<string, Promise<void>>();
const loadScript = (src: string) => {
  if (!scripts.has(src)) scripts.set(src, new Promise((ok, fail) => {
    const s = Object.assign(document.createElement('script'), { src, onload: () => ok(), onerror: () => fail(new Error('PayPal SDK failed to load')) });
    document.head.append(s);
  }));
  return scripts.get(src)!;
};

/** PayPal buttons for this member's existing order. Approval here is optimistic; the webhook sets the real status. */
function PayShare({ ctx, previewId, orderId, label, currency }: { ctx: Ctx; previewId: string; orderId: string; label: string; currency: string }) {
  const cfg = useConfig();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'open' | 'approved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (state !== 'open' || !cfg?.paypalClientId || !box.current) return;
    let btns: ReturnType<NonNullable<Window['paypal']>['Buttons']> | null = null;
    loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=${currency}&intent=capture`).then(() => {
      btns = window.paypal!.Buttons({
        createOrder: () => orderId,
        onApprove: () => api(`/trips/${ctx.trip.id}/previews/${previewId}/capture`, { body: {} })
          .then(() => setState('approved'))
          .catch((e) => { setState('error'); setMsg(e.message); }),
        onError: (e: Error) => { setState('error'); setMsg(e.message); },
      });
      return btns.render(box.current!);
    }).catch((e) => { setState('error'); setMsg(e.message); });
    return () => { btns?.close(); };
  }, [state, cfg, orderId, currency, previewId, ctx.trip.id]);

  if (cfg && !cfg.paypalClientId) return <span className="small" style={{ color: 'var(--orange-ink)' }}>PayPal isn’t configured on the server.</span>;
  if (state === 'approved') return <span className="btn btn-on"><Icon d={icons.check} />Approved — waiting for PayPal to confirm</span>;
  if (state === 'idle') return <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => setState('open')}>{label}</button>;
  return (
    <div className="col" style={{ minWidth: 260 }}>
      <div ref={box} />
      {state === 'error' && <span className="small" role="alert" style={{ color: 'var(--orange-ink)' }}>{msg}</span>}
    </div>
  );
}
