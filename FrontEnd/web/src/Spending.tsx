import { useState } from 'react';
import { members, eur, pct, searchTxs, summarize, type Tx } from '../../shared/trip';
import { Chip, Icon, icons } from './ui';

const GROUPS = [['none', 'None'], ['member', 'Member'], ['vendor', 'Vendor'], ['leg', 'Leg']] as const;
const keyOf = (g: string, t: Tx) => (g === 'member' ? members[t.member].name : g === 'vendor' ? t.vendor : t.leg);

function exportCsv(rows: Tx[]) {
  const head = 'member,day,time,vendor,type,leg,amount_eur,item_total_eur,share,source,status';
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = rows.map((t) => [members[t.member].name, `2027-05-${t.day}`, t.time, q(t.vendor), t.type, q(t.leg), (t.amount / 100).toFixed(2), (t.total / 100).toFixed(2), pct(t.shareBp), t.source, t.status].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' }));
  a.download = 'iberia-in-may-spending.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Spending({ txs }: { txs: Tx[] }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('none');
  const hits = searchTxs(txs, q);
  const s = summarize(txs);
  const keys = group === 'none' ? [] : [...new Set(hits.map((t) => keyOf(group, t)))];

  const row = (t: Tx, k: number) => (
    <tr key={k}>
      <td className="sticky"><span className="row" style={{ gap: 8 }}><Chip i={t.member} size={24} />{members[t.member].name}</span></td>
      <td className="muted">May {t.day}, {t.time}</td>
      <td>{t.vendor}</td>
      <td className="muted">{t.type}</td>
      <td className="muted">{t.leg}</td>
      <td className="num" style={{ fontWeight: 500 }}>{eur(t.amount)}</td>
      <td className="num muted">{eur(t.total)}</td>
      <td style={{ minWidth: 120 }}>
        <span className="row" style={{ gap: 8 }}>
          <span className="bar" style={{ flex: 1, height: 6 }}><span style={{ width: `${t.shareBp / 100}%`, background: members[t.member].color }} /></span>
          <span className="mono muted" style={{ fontSize: 12, minWidth: 48, textAlign: 'right' }}>{pct(t.shareBp)}</span>
        </span>
      </td>
      <td className="muted">{t.source}</td>
      <td><span className={`status st-${t.status}`}>{t.status}</span></td>
    </tr>
  );

  return (
    <section className="card">
      <div className="between" style={{ alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 20 }}>Spending</h2>
          <span className="small muted">Everyone in the trip sees every transaction. PayPal emails and private notes are never indexed.</span>
        </div>
        <button type="button" className="btn" onClick={() => exportCsv(hits)}>Export CSV</button>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <label htmlFor="q" className="small" style={{ fontWeight: 600, color: 'var(--body)' }}>Search transactions</label>
        <div className="row" style={{ gap: 10, border: '2px solid var(--brand)', borderRadius: 12, padding: '0 12px', minHeight: 48 }}>
          <Icon d={icons.search} />
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try: hotel > 100" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }} />
          <span className="mono muted" style={{ fontSize: 12 }}>{hits.length} hits</span>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="small" style={{ fontWeight: 600, color: 'var(--body)' }}>Group by</span>
        <div role="group" aria-label="Group rows by" className="seg">
          {GROUPS.map(([id, label]) => <button key={id} type="button" aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>)}
        </div>
      </div>
      <div className="table-box">
        <table style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              {['Member', 'Date / time', 'Vendor', 'Type', 'Location', 'Amount', 'Item total', 'Share', 'Source', 'Status'].map((h, k) => (
                <th key={h} scope="col" className={k === 0 ? 'sticky' : k === 5 || k === 6 ? 'num' : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group === 'none'
              ? hits.map(row)
              : keys.flatMap((key) => {
                  const items = hits.filter((t) => keyOf(group, t) === key);
                  return [
                    <tr key={`g-${key}`} className="group-row">
                      <td colSpan={5} className="sticky" style={{ background: 'var(--gray-tint)' }}>{key}</td>
                      <td className="num">{eur(items.reduce((a, t) => a + t.amount, 0))}</td>
                      <td colSpan={4} className="small muted" style={{ fontWeight: 400 }}>{items.length} rows · sum</td>
                    </tr>,
                    ...items.map((t, k) => row(t, k + 1000 * keys.indexOf(key))),
                  ];
                })}
            {hits.length === 0 && <tr><td colSpan={10} className="muted">No transactions match “{q}”.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="between small" style={{ color: 'var(--body)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
        <span>{s.count} transactions · 4 members</span>
        <span>
          Captured <strong className="mono">{eur(s.captured)}</strong> · Logged <strong className="mono">{eur(s.logged)}</strong> · Pending <strong className="mono">{eur(s.pending)}</strong> · Total <strong className="mono">{eur(s.total)}</strong>
        </span>
      </div>
    </section>
  );
}
