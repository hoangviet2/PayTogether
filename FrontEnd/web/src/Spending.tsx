import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { themeQuartz, type ColDef } from 'ag-grid-community';
import { money, pct, summarizeTrip, type Txn } from '../../shared/trip';
import { api, type Ctx } from './api';
import { Icon, icons } from './ui';
import { Bills, SplitBills } from './Bills';

type Row = Txn & { memberName: string; paidByName: string };
const theme = themeQuartz.withParams({ fontFamily: 'Inter, system-ui, sans-serif', headerFontWeight: 600, accentColor: '#003087' });

export function Spending({ ctx }: { ctx: Ctx }) {
  const { trip } = ctx;
  const grid = useRef<AgGridReact<Row>>(null);
  const [q, setQ] = useState('');
  const [hit, setHit] = useState<{ ids: Set<string>; engine: string } | null>(null);

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
    () => trip.txs.filter((t) => !active || active.ids.has(t.id)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((t) => ({ ...t, memberName: trip.members[t.member].name, paidByName: trip.members[t.paid_by].name })),
    [trip.txs, trip.members, active],
  );
  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const cur = (p: { value: number | null }) => (p.value == null ? '' : money(p.value, trip.currency));
    return [
    // Each person's rows in their own color, with their symbol so color isn't the only cue.
    { field: 'memberName', headerName: 'Member', pinned: 'left',
      valueFormatter: (p) => (p.data ? `${trip.members[p.data.member].symbol} ${p.value}` : p.value), cellStyle: (p) => (p.data ? { color: trip.members[p.data.member].color, fontWeight: 600 } : null) },
    { field: 'date', headerName: 'Date', width: 120 },
    { field: 'time', width: 90 },
    { field: 'vendor' },
    { field: 'type', width: 120 },
    { field: 'leg', headerName: 'Leg' },
    { field: 'amount', headerName: 'Amount', type: 'rightAligned', valueFormatter: cur, filter: 'agNumberColumnFilter', width: 130 },
    { field: 'total', headerName: 'Item total', type: 'rightAligned', valueFormatter: cur, width: 130 },
    { field: 'shareBp', headerName: 'Share', valueFormatter: (p) => (p.value == null ? '' : pct(p.value)), width: 100 },
    { field: 'paidByName', headerName: 'Paid by', width: 120, cellStyle: (p) => (p.data ? { color: trip.members[p.data.paid_by].color } : null) },
    { field: 'source', width: 140 },
    { field: 'status', width: 110, cellClass: (p) => (p.value ? `status st-${p.value}` : '') },
  ];
  }, [trip.currency, trip.members]);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: false, filter: true, resizable: true }), []); // no header sorting; rows stay in date order
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
      {/* autoHeight: the grid grows with its rows, so it never scrolls inside the page (a sort used to leave it
          half-scrolled under its own header). */}
      <div>
        <AgGridReact<Row>
          domLayout="autoHeight"
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
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
