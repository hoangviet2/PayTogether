import { members, displayName, eur, summarize, ME, type Tx } from '../../shared/trip';

const C = 2 * Math.PI * 60; // donut circumference

export function Dashboard({ txs }: { txs: Tx[] }) {
  const s = summarize(txs);
  const lens = s.byMember.map((c) => (s.total ? (c / s.total) * C : 0));
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  const maxType = Math.max(1, ...s.byType.map((t) => t.amount));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <Kpi label="Trip total" value={eur(s.total)} sub={`${s.count} transactions`} />
        <Kpi label="Prepaid collected" value={eur(s.prepaidCollected)} sub={`${eur(s.prepaidTotal - s.prepaidCollected)} outstanding of ${eur(s.prepaidTotal)}`} progress={s.prepaidCollected / s.prepaidTotal} />
        <Kpi label="Average per person" value={eur(s.avg)} sub="4 members" />
        <Kpi label="Your share so far" value={eur(s.byMember[ME])} sub="charged directly to your PayPal" dark />
      </div>

      <section aria-labelledby="donut-h" className="card">
        <h2 id="donut-h" style={{ fontSize: 18 }}>Spend per member</h2>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <svg width="168" height="168" viewBox="0 0 160 160" role="img" aria-label={`Spend per member: ${members.map((m, i) => `${m.name} ${eur(s.byMember[i])}`).join(', ')}`}>
            <g transform="rotate(-90 80 80)" fill="none" strokeWidth="22">
              {members.map((m, i) => (
                <circle key={i} cx="80" cy="80" r="60" stroke={m.color} strokeDasharray={`${Math.max(0, lens[i] - 2)} ${C}`} strokeDashoffset={-starts[i]} />
              ))}
            </g>
            <text x="80" y="76" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="15" fill="#012169">{eur(s.total).split('.')[0]}</text>
            <text x="80" y="94" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fill="#5B6068">total</text>
          </svg>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minWidth: 160 }} className="col">
            {members.map((m, i) => (
              <li key={m.id}>
                <a href="#/trip/spending" className="row" style={{ gap: 10, minHeight: 36, textDecoration: 'none', color: 'var(--ink)', fontSize: 14 }}>
                  <span style={{ color: m.color, width: 14 }}>{m.symbol}</span><span style={{ flex: 1 }}>{displayName(i)}</span><span className="mono">{eur(s.byMember[i])}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="leg-h" className="card">
        <div className="between" style={{ alignItems: 'baseline' }}>
          <h2 id="leg-h" style={{ fontSize: 18 }}>Spend per leg, by member</h2>
          <div className="row small" style={{ gap: 14, color: 'var(--body)', flexWrap: 'wrap' }}>
            {members.map((m) => <span key={m.id}><span style={{ color: m.color }}>{m.symbol}</span> {m.name}</span>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr 96px', gap: '12px 14px', alignItems: 'center', fontSize: 14 }}>
          {s.byLeg.map((l) => {
            const legTotal = l.perMember.reduce((a, b) => a + b, 0);
            const maxLeg = Math.max(...s.byLeg.map((x) => x.perMember.reduce((a, b) => a + b, 0)));
            return [
              <span key={`${l.name}-n`}>{l.name}</span>,
              legTotal ? (
                <div key={`${l.name}-b`} style={{ display: 'flex', height: 26, gap: 2, width: `${(legTotal / maxLeg) * 100}%` }} role="img"
                  aria-label={`${l.name}: ${members.map((m, i) => `${m.name} ${eur(l.perMember[i])}`).join(', ')}`}>
                  {members.map((m, i) => <span key={i} style={{ width: `${(l.perMember[i] / legTotal) * 100}%`, background: m.color, borderRadius: 4 }} />)}
                </div>
              ) : <span key={`${l.name}-b`} className="small muted">Nothing booked yet — stay poll open</span>,
              <span key={`${l.name}-t`} className="mono" style={{ textAlign: 'right' }}>{eur(legTotal)}</span>,
            ];
          })}
        </div>
      </section>

      <section aria-labelledby="type-h" className="card">
        <h2 id="type-h" style={{ fontSize: 18 }}>Spend by vendor type</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 96px', gap: '10px 14px', alignItems: 'center', fontSize: 14 }}>
          {s.byType.map((t) => [
            <span key={`${t.type}-n`}>{t.type}</span>,
            <div key={`${t.type}-b`} style={{ height: 18 }}><div style={{ width: `${(t.amount / maxType) * 100}%`, minWidth: 3, height: '100%', background: 'var(--brand)', borderRadius: 4 }} /></div>,
            <span key={`${t.type}-t`} className="mono" style={{ textAlign: 'right' }}>{eur(t.amount)}</span>,
          ])}
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, sub, progress, dark }: { label: string; value: string; sub: string; progress?: number; dark?: boolean }) {
  return (
    <div className="col" style={{ gap: 6, padding: 18, borderRadius: 16, background: dark ? 'var(--ink)' : '#fff', color: dark ? 'var(--bg)' : undefined, border: dark ? undefined : '1px solid var(--line)' }}>
      <span className="small" style={{ color: dark ? '#C9CCD1' : 'var(--muted)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 26, fontWeight: 500 }}>{value}</span>
      {progress !== undefined && <div className="bar" style={{ height: 6 }}><span style={{ width: `${progress * 100}%`, background: 'var(--brand)' }} /></div>}
      <span className="small" style={{ color: dark ? '#C9CCD1' : progress !== undefined ? 'var(--orange-ink)' : 'var(--muted)' }}>{sub}</span>
    </div>
  );
}
