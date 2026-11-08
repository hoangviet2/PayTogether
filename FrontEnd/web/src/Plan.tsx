import { useState } from 'react';
import { legs, members, pollOptions, ME, type Bill } from '../../shared/trip';
import { Icon, icons, SplitEditor } from './ui';

type Props = { bills: Bill[]; setBill: (b: Bill) => void; vote: string | null; setVote: (v: string | null) => void };

export function Plan({ bills, setBill, vote, setVote }: Props) {
  const [nights, setNights] = useState<number[]>(legs.map((l) => l.nights));
  const startOf = (k: number) => legs[0].from + nights.slice(0, k).reduce((a, b) => a + b, 0);
  const day = startOf(legs.length);
  const dated = legs.map((l, k) => ({ ...l, from: startOf(k), to: startOf(k + 1), nights: nights[k] }));
  const bump = (k: number, d: number) => setNights((n) => n.map((x, j) => (j === k ? Math.max(1, x + d) : x)));

  return (
    <>
      <section aria-labelledby="tl-h" className="card" style={{ gap: 18 }}>
        <div className="between" style={{ alignItems: 'center' }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 id="tl-h" style={{ fontSize: 20 }}>Timeline</h2>
            <span className="small muted">{day - legs[0].from} nights · May {legs[0].from} → {day} · Alex changed Seville to 2 nights, 2h ago</span>
          </div>
          <button type="button" className="btn">Open timeline editor</button>
        </div>
        <ol className="legs">
          {dated.map((l, k) => (
            <li key={l.name} className={`tone-${l.tone}`} style={{ flex: `${l.nights} 1 0` }}>
              <div className="between"><strong style={{ fontSize: 16 }}>{l.name}</strong><span className="mono" style={{ fontSize: 12 }}>0{k + 1}</span></div>
              <span className="small">May {l.from} → {l.to}{l.transport && ` · ${l.transport}`}</span>
              <div className="row" style={{ gap: 4 }}>
                <button type="button" className="stepper" aria-label={`Fewer nights in ${l.name}`} onClick={() => bump(k, -1)} disabled={l.nights <= 1}>−</button>
                <span style={{ minWidth: 64, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{l.nights} night{l.nights > 1 ? 's' : ''}</span>
                <button type="button" className="stepper" aria-label={`More nights in ${l.name}`} onClick={() => bump(k, 1)}>+</button>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{l.status}</span>
            </li>
          ))}
          <li style={{ flex: '0 0 auto', minWidth: 0, padding: 0 }}>
            <button type="button" className="btn btn-dashed" style={{ width: 96, height: '100%', flexDirection: 'column', borderRadius: 12 }}>
              <Icon d={icons.plus} />Add leg
            </button>
          </li>
        </ol>
      </section>

      <section aria-labelledby="poll-h" className="card">
        <div className="between">
          <div className="col">
            <span className="eyebrow">Poll · Barcelona stay · {nights[2]} nights</span>
            <h2 id="poll-h" style={{ fontSize: 20 }}>Where should we stay in Barcelona?</h2>
          </div>
          <span className="small muted" style={{ textAlign: 'right' }}>Closes Fri 6:00 PM<br />{vote ? 3 : 2} of 4 voted</span>
        </div>
        <div className="grid-auto">
          {pollOptions.map((o) => {
            const mine = vote === o.id;
            const voters = mine ? [...o.voters, ME] : o.voters;
            return (
              <div key={o.id} className="col" style={{ gap: 10, borderRadius: 14, padding: 12, border: mine ? '2px solid #7E22CE' : '1px solid var(--line)', background: mine ? '#FBF7FE' : '#fff' }}>
                <div role="img" aria-label={`Photo placeholder: ${o.name}`} className="photo"><span>[place photo]</span></div>
                <div className="col">
                  <strong style={{ fontSize: 15 }}>{o.name}</strong>
                  <span className="mono small" style={{ color: 'var(--body)' }}>{o.price}</span>
                </div>
                <p className="small" style={{ lineHeight: 1.45, color: 'var(--body)' }}>{o.why}</p>
                <span className="muted" style={{ fontSize: 12 }}>{o.addedBy}</span>
                <div className="between" style={{ alignItems: 'center', marginTop: 'auto' }}>
                  <span aria-label={`${voters.length} votes`} style={{ fontSize: 14, letterSpacing: 2 }}>
                    {voters.length ? voters.map((v) => <span key={v} style={{ color: members[v].color }}>{members[v].symbol}</span>) : 'No votes yet'}
                  </span>
                  <button type="button" className="btn btn-outline" aria-pressed={mine} onClick={() => setVote(mine ? null : o.id)}
                    style={mine ? { background: '#7E22CE', color: '#fff', borderColor: '#7E22CE' } : undefined}>
                    {mine ? 'Your vote' : 'Vote'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-dashed" style={{ alignSelf: 'flex-start' }}>+ Add option</button>
      </section>

      <section id="splits" aria-labelledby="split-h" className="col" style={{ gap: 14 }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 id="split-h" style={{ fontSize: 20 }}>Split bills</h2>
            <span className="small muted">Drag a bar from 0% to 100% on each bill. Unlocked members rebalance so the total stays at 100%.</span>
          </div>
          <span className="small muted">2 prepaid bills · {bills.filter((b) => !b.frozen && !b.accepted[ME]).length} needs your acceptance</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
          {bills.map((b) => <SplitEditor key={b.id} bill={b} onChange={setBill} />)}
        </div>
      </section>
    </>
  );
}
