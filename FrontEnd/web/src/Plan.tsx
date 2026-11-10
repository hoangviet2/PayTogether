import { useState } from 'react';
import { PHASES, money, pollTally, validateTimeline, type Poll } from '../../shared/trip';
import type { Ctx } from './api';
import { Chip, Icon, icons, PhaseBar, PreviewCard } from './ui';

const TONES = ['tone-blue', 'tone-orange', 'tone-gray'];

export function Plan({ ctx }: { ctx: Ctx }) {
  const { trip, act } = ctx;
  const at = PHASES.indexOf(trip.phase);
  const errs = trip.legs.length ? validateTimeline(trip.legs, trip.window) : [];
  const bump = (id: string, nights: number) => act('/legs', { nights: { [id]: nights } });
  const editable = trip.phase === 'TIMELINE' || trip.phase === 'PLACES';
  // + takes a night from another stop, so it needs one that has more than 1 (a one-stop trip just gets longer).
  const canGrow = (k: number) => trip.legs.length === 1 || trip.legs.some((l, i) => i !== k && l.nights > 1);

  return (
    <>
      <PhaseBar ctx={ctx} />

      <section aria-labelledby="dest-h" className="card">
        <div className="between">
          <h2 id="dest-h" style={{ fontSize: 20 }}>Where and when</h2>
          {trip.budget_per_person_cents && <span className="small muted">Budget {money(trip.budget_per_person_cents, trip.currency)} per person</span>}
        </div>
        {trip.destinations.length ? (
          <p style={{ fontSize: 16 }}>
            <strong>{trip.destinations.join(' → ')}</strong>
            <span className="muted"> · {trip.window ? `${trip.window.start} to ${trip.window.end}` : 'dates to be set'}</span>
          </p>
        ) : (
          <p className="muted">Nothing yet. Type in the chat where you’d like to go, roughly when, and a budget if you have one. Wayfinder will turn it into a plan.</p>
        )}
      </section>

      {at >= 1 && (
        <section aria-labelledby="tl-h" className="card" style={{ gap: 18 }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 id="tl-h" style={{ fontSize: 20 }}>Timeline</h2>
            <span className="small muted">
              {trip.legs.length ? `${trip.legs.reduce((a, l) => a + l.nights, 0)} nights · ${trip.legs[0].arrive_date} → ${trip.legs.at(-1)!.depart_date}` : 'Wayfinder is drafting the legs…'}
              {editable && trip.legs.length > 0 && ' · change nights with − / + (the other stops adjust to keep the trip length), or ask Wayfinder'}
            </span>
          </div>
          {trip.legs.length > 0 && (
            <ol className="legs">
              {trip.legs.map((l, k) => (
                <li key={l.id} className={TONES[k % 3]} style={{ flex: `${l.nights} 1 0` }}>
                  <div className="between"><strong style={{ fontSize: 16 }}>{l.destination.name}</strong><span className="mono" style={{ fontSize: 12 }}>0{k + 1}</span></div>
                  <span className="small">{l.arrive_date} → {l.depart_date}{l.transport_hint && l.transport_hint !== 'none' && ` · ${l.transport_hint}`}</span>
                  {editable ? (
                    <div className="row" style={{ gap: 4 }}>
                      <button type="button" className="stepper" aria-label={`Fewer nights in ${l.destination.name}`} onClick={() => bump(l.id, l.nights - 1)} disabled={l.nights <= 1}>−</button>
                      <span style={{ minWidth: 64, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{l.nights} night{l.nights > 1 ? 's' : ''}</span>
                      <button type="button" className="stepper" aria-label={`More nights in ${l.destination.name}`} onClick={() => bump(l.id, l.nights + 1)} disabled={!canGrow(k)}>+</button>
                    </div>
                  ) : <span style={{ fontSize: 14, fontWeight: 600 }}>{l.nights} night{l.nights > 1 ? 's' : ''}</span>}
                </li>
              ))}
            </ol>
          )}
          {errs.length > 0 && <ul className="small" style={{ color: 'var(--orange-ink)', margin: 0 }}>{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        </section>
      )}

      {trip.polls.map((p) => <PollCard key={p.id} ctx={ctx} poll={p} />)}
      {trip.phase === 'PLACES' && !trip.polls.some((p) => p.kind === 'stay') && (
        <p className="card muted">Wayfinder is searching stays for each leg. Polls show up here.</p>
      )}

      {at >= 3 && (
        <section aria-labelledby="split-h" className="col" style={{ gap: 14 }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 id="split-h" style={{ fontSize: 20 }}>{trip.solo ? 'Your bills' : 'Split bills'}</h2>
            <span className="small muted">{trip.solo
              ? 'Every bill is 100% yours. Accept one to get its PayPal payment request.'
              : 'Move your own bar. Shares must add up to exactly 100%; when everyone accepts, each person gets a PayPal request for their share.'}</span>
          </div>
          {trip.previews.length === 0 && <p className="card muted">Wayfinder is pricing the winning places…</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
            {trip.previews.map((p) => <PreviewCard key={p.id} ctx={ctx} p={p} />)}
          </div>
        </section>
      )}
    </>
  );
}

function PollCard({ ctx, poll }: { ctx: Ctx; poll: Poll }) {
  const { trip, me, act } = ctx;
  const [adding, setAdding] = useState('');
  const { voted } = pollTally(poll);
  const open = poll.status === 'open';
  const leg = trip.legs.find((l) => l.id === poll.leg_id);
  return (
    <section aria-label={poll.question} className="card">
      <div className="between">
        <div className="col">
          <span className="eyebrow">Poll · {poll.kind}{leg ? ` · ${leg.destination.name} · ${leg.nights} nights` : ''}</span>
          <h2 style={{ fontSize: 20 }}>{poll.question}</h2>
        </div>
        <span className="small muted" style={{ textAlign: 'right' }}>{open ? `${voted} of ${trip.members.length} voted` : 'Closed'}</span>
      </div>
      <div className="grid-auto">
        {poll.options.map((o) => {
          const mine = o.voters.includes(me);
          const won = poll.winner === o.id;
          return (
            <div key={o.id} className="col" style={{ gap: 10, borderRadius: 14, padding: 12, border: mine || won ? '2px solid var(--brand)' : '1px solid var(--line)', background: won ? 'var(--blue-tint)' : '#fff' }}>
              <div className="col">
                <strong style={{ fontSize: 15 }}>{o.name}{won && ' · winner'}</strong>
                <span className="mono small" style={{ color: 'var(--body)' }}>
                  {o.price ? `${money(o.price.amount_cents, o.price.currency)} ${o.price.unit.replace('_', ' ')} (est.)` : 'No price found yet'}
                </span>
                {o.rating !== undefined && <span className="small muted">Rated {o.rating}</span>}
              </div>
              <p className="small" style={{ lineHeight: 1.45, color: 'var(--body)' }}>{o.why}</p>
              <span className="muted" style={{ fontSize: 12 }}>
                {o.added_by === 'ai' ? 'Suggested by Wayfinder' : `Added by ${trip.members[o.added_by].name}`}
                {o.source_url && <> · <a href={o.source_url} target="_blank" rel="noreferrer noopener">source</a></>}
              </span>
              <div className="between" style={{ alignItems: 'center', marginTop: 'auto' }}>
                <span aria-label={`${o.voters.length} votes`} className="row" style={{ gap: 2 }}>
                  {o.voters.length ? o.voters.map((v) => <Chip key={v} p={trip.members[v]} size={22} />) : <span className="small muted">No votes yet</span>}
                </span>
                {open && (
                  <button type="button" className={`btn ${mine ? 'btn-on' : 'btn-outline'}`} aria-pressed={mine}
                    onClick={() => act(`/polls/${poll.id}/vote`, { option_id: mine ? null : o.id })}>
                    {mine ? 'Your vote' : 'Vote'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <form className="row" style={{ gap: 8, flex: 1, minWidth: 260 }} onSubmit={(e) => { e.preventDefault(); if (adding.trim()) act(`/polls/${poll.id}/options`, { name: adding.trim() }); setAdding(''); }}>
            <label className="sr-only" htmlFor={`add-${poll.id}`}>Add an option</label>
            <input id={`add-${poll.id}`} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Suggest another place"
              style={{ flex: 1, minWidth: 0, minHeight: 44, border: '1px solid var(--input)', borderRadius: 10, padding: '0 12px' }} />
            <button type="submit" className="btn btn-dashed"><Icon d={icons.plus} />Add option</button>
          </form>
          <button type="button" className="btn" onClick={() => act(`/polls/${poll.id}/close`)}>Close poll</button>
        </div>
      )}
    </section>
  );
}
