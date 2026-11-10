import { useMemo, useState, type FormEvent } from 'react';
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react';
import { themeQuartz, type ColDef } from 'ag-grid-community';
import { equalBps, money, pct, shareAmounts, type Preview, type Share } from '../../shared/trip';
import type { Ctx } from './api';
import { Icon, icons, PayShare, PreviewCard } from './ui';

type Row = { id: string; previewId: string; bill: string; kind: string; member: number; memberName: string; isMe: boolean; bp: number; cents: number | null; status: string; orderId?: string };
type GridCtx = { pay: (r: Row) => void };
const theme = themeQuartz.withParams({ fontFamily: 'Inter, system-ui, sans-serif', headerFontWeight: 600, accentColor: '#003087' });
const KIND = { stay: 'Stay', dining: 'Dining', store: 'In-store', shop: 'Online' } as const;
const PAID: Record<Share['status'], string> = { none: '—', created: 'Ready to pay', approved: 'Approved · capturing', captured: 'Paid', failed: 'Payment failed' };
const payable = (r: Row) => r.isMe && !!r.orderId && (r.status === PAID.created || r.status === PAID.failed);

/** Spending tab, top: bills still being split. Once everyone on a bill accepts, it moves to Bills and payments. */
export function SplitBills({ ctx }: { ctx: Ctx }) {
  const { trip } = ctx;
  const open = trip.previews.filter((p) => !p.frozen);
  if (!trip.previews.length) return null;
  return (
    <section aria-labelledby="split-h" className="col" style={{ gap: 14 }}>
      <div className="col" style={{ gap: 2 }}>
        <h2 id="split-h" style={{ fontSize: 20 }}>{trip.solo ? 'Your bills' : 'Split bills'}</h2>
        <span className="small muted">{trip.solo
          ? 'Every bill is 100% yours. Accept one to move it to Bills and payments.'
          : 'Move your own bar; the others adjust so shares always add up to 100%. When everyone accepts, the bill moves to Bills and payments.'}</span>
      </div>
      {!open.length && <p className="card muted">Everyone has accepted every bill. Pay your shares in Bills and payments below.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        {open.map((p) => <PreviewCard key={p.id} ctx={ctx} p={p} />)}
      </div>
    </section>
  );
}

const status = (p: Preview, s: Share) => (p.frozen ? PAID[s.status] : 'Accepted · waiting for the others');

function PayCell({ data, context }: CustomCellRendererProps<Row, unknown, GridCtx>) {
  if (!data || !payable(data)) return null;
  return <button type="button" className="btn btn-primary" style={{ minHeight: 36 }} onClick={() => context.pay(data)}>Pay</button>;
}

/** Spending tab: every share someone has accepted, with its payment status. Paying happens here, when each person is ready. */
export function Bills({ ctx }: { ctx: Ctx }) {
  const { trip, me } = ctx;
  const [paying, setPaying] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo<Row[]>(() => trip.previews.flatMap((p) => {
    const cents = shareAmounts(p);
    return p.shares.flatMap((s, i) => (!s.ratio_bp || (!s.accepted && !p.frozen) ? [] : [{
      id: `${p.id}-${i}`, previewId: p.id, bill: p.title, kind: KIND[p.kind], member: i, memberName: trip.members[i].name, isMe: i === me,
      bp: s.ratio_bp, cents: cents?.[i] ?? null, status: status(p, s), orderId: s.order_id,
    }]));
  }), [trip.previews, trip.members, me]);

  const columnDefs = useMemo<ColDef<Row>[]>(() => [
    { field: 'bill', headerName: 'Bill', flex: 2, minWidth: 160 },
    { field: 'kind', headerName: 'Type', width: 110 },
    { field: 'memberName', headerName: 'Who', width: 150, valueFormatter: (p) => (p.data ? `${trip.members[p.data.member].symbol} ${p.value}${p.data.isMe ? ' (you)' : ''}` : p.value),
      cellStyle: (p) => (p.data ? { color: trip.members[p.data.member].color, fontWeight: 600 } : null) },
    { field: 'bp', headerName: 'Share', width: 100, valueFormatter: (p) => (p.value == null ? '' : pct(p.value)) },
    { field: 'cents', headerName: 'Amount', type: 'rightAligned', width: 120, valueFormatter: (p) => (p.value == null ? '—' : money(p.value, trip.currency)) },
    { field: 'status', headerName: 'Status', flex: 1, minWidth: 170 },
    { headerName: '', colId: 'pay', width: 130, cellRenderer: PayCell, sortable: false, filter: false },
  ], [trip.currency, trip.members]);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: false, filter: true, resizable: true }), []);
  const context = useMemo<GridCtx>(() => ({ pay: setPaying }), []);
  const mine = rows.filter((r) => r.isMe && payable(r));

  return (
    <section aria-labelledby="bills-h" className="card">
      <div className="between" style={{ alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 id="bills-h" style={{ fontSize: 20 }}>Bills and payments</h2>
          <span className="small muted">Shares show up here once accepted. When everyone on a bill has accepted, pay your share whenever you’re ready.{mine.length ? ` You have ${mine.length} to pay.` : ''}</span>
        </div>
        <button type="button" className={`btn ${adding ? 'btn-on' : ''}`} aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Icon d={icons.plus} />Pay at a store</button>
      </div>
      {adding && <StoreBill ctx={ctx} onDone={() => setAdding(false)} />}
      {rows.length ? (
        <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(p) => p.data.id}
          context={context} domLayout="autoHeight" rowHeight={48} />
      ) : <p className="muted small">Nothing accepted yet.</p>}
      {paying?.orderId && (
        <div className="col" style={{ gap: 10, borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <div className="between" style={{ alignItems: 'center' }}>
            <strong>Pay your share of {paying.bill}{paying.cents != null && ` · ${money(paying.cents, trip.currency)}`}</strong>
            <button type="button" className="btn" onClick={() => setPaying(null)}>Close</button>
          </div>
          <PayShare key={paying.orderId} ctx={ctx} previewId={paying.previewId} orderId={paying.orderId} currency={trip.currency} autoOpen
            label={`Pay ${paying.cents == null ? '' : money(paying.cents, trip.currency)}`} />
        </div>
      )}
    </section>
  );
}

/** In-store checkout for things nobody planned (a dinner, a ticket at the door): each person pays the store's PayPal. */
function StoreBill({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const { trip, me, act } = ctx;
  // Percent per member as typed; 0 means not on the bill. Starts equal.
  const [pcts, setPcts] = useState(() => equalBps(trip.members.length).map((b) => String(b / 100)));
  const bps = trip.solo ? trip.members.map((_, i) => (i === me ? 10000 : 0)) : pcts.map((v) => Math.round((parseFloat(v) || 0) * 100));
  const sum = bps.reduce((a, b) => a + b, 0);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const total = Math.round(parseFloat(String(f.get('total'))) * 100);
    await act('/store-bills', { vendor: String(f.get('vendor')).trim(), email: String(f.get('email')).trim(), total, category: f.get('category'), members: [], bps });
    onDone();
  };
  return (
    <form onSubmit={submit} className="col" style={{ gap: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <p className="small muted">For costs nobody planned, like a dinner. The store must accept PayPal. {trip.solo ? 'You accept' : 'Everyone on the bill accepts'} the amount, then pays the store’s PayPal directly.{trip.solo ? '' : ' If you take 100%, nobody else has to accept.'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label className="field">Store<input name="vendor" required maxLength={60} placeholder="Pho 24" /></label>
        <label className="field">Store’s PayPal email<input name="email" type="email" required placeholder="pay@store.com" aria-describedby="store-email-hint" />
          <span id="store-email-hint" className="small muted" style={{ fontWeight: 400 }}>Email only. PayPal can’t pay a phone number.</span></label>
        <label className="field">Total ({trip.currency})<input name="total" inputMode="decimal" required pattern="\d+(\.\d{1,2})?" placeholder="42.50" /></label>
        <label className="field">Type<select name="category">{['Restaurant', 'Store', 'Transport', 'Tickets', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      {!trip.solo && (
        <fieldset className="col" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
          <legend className="field" style={{ marginBottom: 6 }}>Split (0% = not on the bill; each can still move their own bar later)</legend>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {trip.members.map((m, i) => (
              <label key={i} className="row" style={{ gap: 6, fontSize: 14, minHeight: 44 }}>
                <span style={{ color: m.color }}>{m.symbol}</span>{m.name}{i === me ? ' (you)' : ''}
                <input value={pcts[i]} inputMode="decimal" aria-label={`${m.name}'s share in percent`} style={{ width: 70, minHeight: 40, border: '1px solid var(--input)', borderRadius: 10, padding: '0 8px' }}
                  onChange={(e) => setPcts((p) => p.map((v, j) => (j === i ? e.target.value : v)))} />%
              </label>
            ))}
            <button type="button" className="btn" onClick={() => setPcts(trip.members.map((_, i) => (i === me ? '100' : '0')))}>I’ll pay 100%</button>
          </div>
          {sum !== 10000 && <p role="alert" className="small" style={{ color: 'var(--orange-ink)', margin: 0 }}>Shares add up to {pct(sum)}; they need to total 100%.</p>}
        </fieldset>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={sum !== 10000}>Add bill</button>
      </div>
    </form>
  );
}
