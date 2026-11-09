import { useMemo } from 'react';
import { AgCharts } from 'ag-charts-react';
import type { AgCartesianChartOptions, AgPolarChartOptions } from 'ag-charts-community';
import { balances, money, settle, summarizeTrip } from '../../shared/trip';
import type { Ctx } from './api';
import { Chip } from './ui';

const validations = import.meta.env.DEV ? { throwOn: ['error', 'warning', 'deprecation'] as ('error' | 'warning' | 'deprecation')[] } : undefined;

export function Dashboard({ ctx }: { ctx: Ctx }) {
  const { trip, me } = ctx;
  const s = summarizeTrip(trip);
  const fmt = (c: number) => money(c, trip.currency);
  const bal = balances(trip.txs, trip.members.length);
  const transfers = settle(bal);

  const { donut, byLeg, byType } = useMemo(() => {
    const sm = summarizeTrip(trip);
    const yAxis = { type: 'number' as const, label: { formatter: ({ value }: { value: number }) => money(value * 100, trip.currency) } };
    return {
      donut: {
        validations,
        data: trip.members.map((m, i) => ({ name: `${m.symbol} ${m.name}`, amount: sm.byMember[i] })),
        series: [{ type: 'donut', angleKey: 'amount', sectorLabelKey: 'name', legendItemKey: 'name', innerRadiusRatio: 0.6, fills: trip.members.map((m) => m.color) }],
      } as AgPolarChartOptions,
      byLeg: {
        validations,
        data: sm.byLeg.map((l) => Object.fromEntries([['leg', l.name], ...trip.members.map((m, i) => [m.name, l.perMember[i] / 100])])),
        series: trip.members.map((m) => ({ type: 'bar' as const, xKey: 'leg', yKey: m.name, yName: `${m.symbol} ${m.name}`, stacked: true, fill: m.color })),
        axes: { x: { type: 'category' }, y: yAxis },
      } as AgCartesianChartOptions,
      byType: {
        validations,
        data: sm.byType.map((t) => ({ type: t.type, amount: t.amount / 100 })),
        series: [{ type: 'bar', xKey: 'type', yKey: 'amount', yName: 'Spend', fill: '#003087' }],
        axes: { x: { type: 'category' }, y: yAxis },
      } as AgCartesianChartOptions,
    };
  }, [trip]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <Kpi label="Trip total" value={fmt(s.total)} sub={`${s.count} transactions`} />
        <Kpi label="Prepaid collected" value={fmt(s.prepaidCollected)} sub={s.prepaidTotal ? `${fmt(s.prepaidTotal - s.prepaidCollected)} outstanding of ${fmt(s.prepaidTotal)}` : 'Nothing prepaid yet'}
          progress={s.prepaidTotal ? s.prepaidCollected / s.prepaidTotal : undefined} />
        <Kpi label="Average per person" value={fmt(Math.round(s.total / trip.members.length))} sub={`${trip.members.length} members`} />
        <Kpi label="Your share so far" value={fmt(s.byMember[me])} sub="charged directly to your PayPal" dark />
      </div>

      {s.count === 0 ? (
        <p className="card muted">Charts fill in once shares are paid or expenses are logged.</p>
      ) : (
        <>
          <section aria-labelledby="donut-h" className="card">
            <h2 id="donut-h" style={{ fontSize: 18 }}>Spend per member</h2>
            <div style={{ height: 300 }}><AgCharts options={donut} /></div>
          </section>
          <section aria-labelledby="leg-h" className="card">
            <h2 id="leg-h" style={{ fontSize: 18 }}>Spend per leg, by member</h2>
            <div style={{ height: 320 }}><AgCharts options={byLeg} /></div>
          </section>
          <section aria-labelledby="type-h" className="card">
            <h2 id="type-h" style={{ fontSize: 18 }}>Spend by vendor type</h2>
            <div style={{ height: 280 }}><AgCharts options={byType} /></div>
          </section>
        </>
      )}

      <section aria-labelledby="settle-h" className="card">
        <h2 id="settle-h" style={{ fontSize: 18 }}>Settle up</h2>
        <p className="small muted">From expenses one person paid for others. Prepaid shares are already settled because everyone paid their own.</p>
        <ul className="col" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
          {trip.members.map((m, i) => (
            <li key={i} className="row" style={{ gap: 10, fontSize: 14 }}>
              <Chip p={m} size={24} /><span style={{ flex: 1 }}>{m.name}</span>
              <span className="mono" style={{ color: bal[i] < 0 ? 'var(--orange-ink)' : undefined }}>{bal[i] > 0 ? `is owed ${fmt(bal[i])}` : bal[i] < 0 ? `owes ${fmt(-bal[i])}` : 'even'}</span>
            </li>
          ))}
        </ul>
        {transfers.length > 0 && (
          <div className="col" style={{ gap: 6, borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
            <strong style={{ fontSize: 14 }}>Fewest transfers</strong>
            {transfers.map((t, k) => (
              <span key={k} className="small">{trip.members[t.from].name} → {trip.members[t.to].name}: <span className="mono">{fmt(t.amount)}</span></span>
            ))}
          </div>
        )}
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
