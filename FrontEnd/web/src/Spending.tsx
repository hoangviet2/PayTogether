import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { themeQuartz, type AutoGroupColumnDef, type ColDef } from 'ag-grid-community';
import { money, pct, summarizeTrip, type Txn } from '../../shared/trip';
import { api, type Ctx } from './api';
import { Icon, icons } from './ui';
import { Bills, SplitBills } from './Bills';

type Row = Txn & { memberName: string; paidByName: string };
const GROUPS = [['none', 'None'], ['memberName', 'Member'], ['vendor', 'Vendor'], ['leg', 'Leg']] as const;
const theme = themeQuartz.withParams({ fontFamily: 'Inter, system-ui, sans-serif', headerFontWeight: 600, accentColor: '#003087' });

export function Spending({ ctx }: { ctx: Ctx }) {
  const { trip } = ctx;
  const grid = useRef<AgGridReact<Row>>(null);
  const [q, setQ] = useState('');
  const [hit, setHit] = useState<{ ids: Set<string>; engine: string } | null>(null);
  const [group, setGroup] = useState<(typeof GROUPS)[number][0]>('none');

  // Search runs on the server (Elasticsearch when configured), always scoped to this trip.
  useEffect(() => {
    if (!q.trim()) return;
    const timer = setTimeout(() => {
      api<{ ids: string[]; engine: string }>(`/trips/${trip.id}/search?q=${encodeURIComponent(q)}`)
        .then((r) => setHit({ ids: new Set(r.ids), engine: r.engine }))
        .catch(() => setHit(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, trip.id, trip.txs.length]);

  const active = q.trim() ? hit : null;
  const rows = useMemo<Row[]>(
    () => trip.txs.filter((t) => !active || active.ids.has(t.id)).map((t) => ({ ...t, memberName: trip.members[t.member].name, paidByName: trip.members[t.paid_by].name })),
    [trip.txs, trip.members, active],
  );
  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const cur = (p: { value: number | null }) => (p.value == null ? '' : money(p.value, trip.currency));
    return [
    // Each person's rows in their own color, with their symbol so color isn't the only cue.
    { field: 'memberName', headerName: 'Member', pinned: 'left', rowGroup: group === 'memberName', hide: group === 'memberName',
      valueFormatter: (p) => (p.data ? `${trip.members[p.data.member].symbol} ${p.value}` : p.value), cellStyle: (p) => (p.data ? { color: trip.members[p.data.member].color, fontWeight: 600 } : null) },
    { field: 'date', headerName: 'Date', sort: 'asc', width: 120 },
    { field: 'time', width: 90 },
    { field: 'vendor', rowGroup: group === 'vendor', hide: group === 'vendor' },
    { field: 'type', width: 120 },
    { field: 'leg', headerName: 'Leg', rowGroup: group === 'leg', hide: group === 'leg' },
    { field: 'amount', headerName: 'Amount', type: 'rightAligned', aggFunc: 'sum', valueFormatter: cur, filter: 'agNumberColumnFilter', width: 130 },
    { field: 'total', headerName: 'Item total', type: 'rightAligned', valueFormatter: cur, width: 130 },
    { field: 'shareBp', headerName: 'Share', valueFormatter: (p) => (p.value == null ? '' : pct(p.value)), width: 100 },
    { field: 'paidByName', headerName: 'Paid by', width: 120, cellStyle: (p) => (p.data ? { color: trip.members[p.data.paid_by].color } : null) },
    { field: 'source', width: 140 },
    { field: 'status', width: 110, cellClass: (p) => (p.value ? `status st-${p.value}` : '') },
  ];
  }, [group, trip.currency, trip.members]);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);
  const autoGroupColumnDef = useMemo<AutoGroupColumnDef<Row>>(() => ({ minWidth: 200 }), []);
  const s = summarizeTrip(trip);

  return (
    <>
    <SplitBills ctx={ctx} />
    <Bills ctx={ctx} />
    <section className="card">
      <div className="between" style={{ alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 20 }}>Spending</h2>
          <span className="small muted">Everyone in the trip sees every transaction. PayPal emails and private notes are never indexed.</span>
        </div>
        <button type="button" className="btn" onClick={() => grid.current?.api.exportDataAsCsv({ fileName: `${trip.name}-spending.csv` })}>Export CSV</button>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <label htmlFor="q" className="small" style={{ fontWeight: 600, color: 'var(--body)' }}>Search transactions</label>
        <div className="row" style={{ gap: 10, border: '2px solid var(--brand)', borderRadius: 12, padding: '0 12px', minHeight: 48 }}>
          <Icon d={icons.search} />
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try: hotel > 100" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }} />
          <span className="mono muted" style={{ fontSize: 12 }}>{rows.length} hits{active ? ` · ${active.engine}` : ''}</span>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="small" style={{ fontWeight: 600, color: 'var(--body)' }}>Group by</span>
        <div role="group" aria-label="Group rows by" className="seg">
          {GROUPS.map(([id, label]) => <button key={id} type="button" aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>)}
        </div>
      </div>
      <div style={{ height: 480 }}>
        <AgGridReact<Row>
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          groupDefaultExpanded={1}
          getRowId={(p) => p.data.id}
          overlayNoRowsTemplate={q ? `No transactions match “${q.replace(/[<>&]/g, '')}”.` : 'No transactions yet. Paid shares and logged expenses show up here.'}
        />
      </div>
      <div className="between small" style={{ color: 'var(--body)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
        <span>{s.count} transactions · {trip.members.length} members</span>
        <span>
          Captured <strong className="mono">{money(s.captured, trip.currency)}</strong> · Logged <strong className="mono">{money(s.logged, trip.currency)}</strong> · Pending <strong className="mono">{money(s.pending, trip.currency)}</strong> · Total <strong className="mono">{money(s.total, trip.currency)}</strong>
        </span>
      </div>
    </section>
    </>
  );
}
