import { useMemo, useState, type FormEvent } from 'react';
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react';
import { themeQuartz, type ColDef } from 'ag-grid-community';
import { equalBps, money, pct, shareAmounts, type Preview, type Share, type Trip } from '../../shared/trip';
import { api, type Ctx } from './api';
import { editPct, Icon, icons, PayShare, PreviewCard } from './ui';

type Row = {
  id: string; previewId: string; bill: string; kind: string; member: number; memberName: string; isMe: boolean; bp: number; cents: number | null; status: string; orderId?: string;
  frozen: boolean; storePay: boolean; locked: boolean; votes: number; needed: number; voted: boolean; solo: number | null; // for Split again / Delete
};
type GridCtx = { pay: (r: Row) => void; act: Ctx['act'] };
const theme = themeQuartz.withParams({ fontFamily: 'Inter, system-ui, sans-serif', headerFontWeight: 600, accentColor: '#003087' });
const KIND = { stay: 'Prepaid', dining: 'Prepaid', plan: 'Prepaid', store: 'In-store', shop: 'Online' } as const;
const PAID: Record<Share['status'], string> = { none: '—', created: 'Awaiting payment', approved: 'Verifying', captured: 'Paid', failed: 'Payment failed' };
const payable = (r: Row) => r.isMe && !!r.orderId && (r.status === PAID.created || r.status === PAID.failed);

/** Spending tab, top: bills still being split. Once everyone on a bill accepts, it moves to Payments due. */
export function SplitBills({ ctx }: { ctx: Ctx }) {
  const { trip } = ctx;
  const open = trip.previews.filter((p) => !p.frozen);
  if (!trip.previews.length) return null;
  return (
    <section aria-labelledby="split-h" className="col" style={{ gap: 14 }}>
      <div className="col" style={{ gap: 2 }}>
        <h2 id="split-h" style={{ fontSize: 20 }}>{trip.solo ? 'Your bills' : 'Split bills'}</h2>
        <span className="small muted">{trip.solo
          ? 'Every bill is 100% yours. Accept one to move it to Payments due.'
          : 'Move your own bar; the others adjust so shares always add up to 100%. When everyone accepts, the bill moves to Payments due. If one person takes 100%, only they need to accept.'}</span>
      </div>
      {!open.length && <p className="card muted">Everyone has accepted every bill. Pay your shares in Payments due below.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        {open.map((p) => <PreviewCard key={p.id} ctx={ctx} p={p} />)}
      </div>
    </section>
  );
}

const status = (p: Preview, s: Share) => (p.frozen ? PAID[s.status] : 'Accepted · waiting for the others');

/** Your row's actions. Split again / Delete act on the whole bill, and only while nobody has paid or approved any of it. */
function ActionsCell({ data, context }: CustomCellRendererProps<Row, unknown, GridCtx>) {
  if (!data?.isMe) return null;
  const r = data;
  const canDelete = !r.locked && (r.solo == null || r.solo === r.member);
  const lastVote = r.solo === r.member || (!r.voted && r.votes + 1 === r.needed);
  const del = () => {
    if (lastVote && !confirm(`Delete ${r.bill}? It's removed from Payments due and the Schedule for everyone.`)) return;
    context.act(`/previews/${r.previewId}/delete`);
  };
  const again = () => { if (confirm(`Send ${r.bill} back to Split bills? Everyone sets their share and accepts again.`)) context.act(`/previews/${r.previewId}/split-again`); };
  const sm = { minHeight: 36, padding: '0 10px' };
  return (
    <span className="row" style={{ gap: 6, height: '100%' }}>
      {payable(r) && <button type="button" className="btn btn-primary" style={sm} onClick={() => context.pay(r)}>Pay</button>}
      {r.frozen && !r.locked && !r.storePay && <button type="button" className="btn" style={sm} onClick={again}>Split again</button>}
      {canDelete && (
        <button type="button" className={`btn ${r.voted ? 'btn-on' : ''}`} style={sm} onClick={del} aria-pressed={r.solo == null ? r.voted : undefined}
          title={r.solo == null ? 'Everyone on the bill must agree to delete it' : 'You pay 100%, so you can delete it'}>
          {r.solo != null ? 'Delete' : `${r.voted ? 'Undo delete' : 'Delete'} · ${r.votes}/${r.needed}`}
        </button>
      )}
    </span>
  );
}

/** Spending tab: every share someone has accepted, with its payment status. Paying happens here, when each person is ready. */
export function Bills({ ctx }: { ctx: Ctx }) {
  const { trip, me } = ctx;
  const [paying, setPaying] = useState<Row | null>(null);
  const [paidMsg, setPaidMsg] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => trip.previews.filter((p) => p.paid_by == null).flatMap((p) => { // already-paid expenses have nothing to pay
    const cents = shareAmounts(p);
    const on = p.shares.flatMap((s, i) => (s.ratio_bp ? [i] : []));
    const votes = p.delete_votes ?? [];
    const bill = { frozen: p.frozen, storePay: !!p.split_bps, locked: p.shares.some((s) => s.status === 'approved' || s.status === 'captured'), votes: votes.length, needed: on.length, solo: on.length === 1 ? on[0] : null };
    return p.shares.flatMap((s, i) => (!s.ratio_bp || s.status === 'captured' || (!s.accepted && !p.frozen) ? [] : [{ // paid: moves to the Spending grid
      id: `${p.id}-${i}`, previewId: p.id, bill: p.title, kind: KIND[p.kind], member: i, memberName: trip.members[i].name, isMe: i === me,
      bp: s.ratio_bp, cents: cents?.[i] ?? null, status: status(p, s), orderId: s.order_id, ...bill, voted: votes.includes(i),
    }]));
  }), [trip.previews, trip.members, me]);

  const columnDefs = useMemo<ColDef<Row>[]>(() => [
    { field: 'bill', headerName: 'Bill', flex: 2, minWidth: 160, valueFormatter: (p) => (p.data?.votes && p.data.solo == null ? `${p.value} · delete requested ${p.data.votes}/${p.data.needed}` : p.value) },
    { field: 'kind', headerName: 'Type', width: 110 },
    { field: 'memberName', headerName: 'Account', width: 150, valueFormatter: (p) => (p.data ? `${trip.members[p.data.member].symbol} ${p.value}${p.data.isMe ? ' (you)' : ''}` : p.value),
      cellStyle: (p) => (p.data ? { color: trip.members[p.data.member].color, fontWeight: 600 } : null) },
    { field: 'bp', headerName: 'Share', width: 100, valueFormatter: (p) => (p.value == null ? '' : pct(p.value)) },
    { field: 'cents', headerName: 'Amount', type: 'rightAligned', width: 120, valueFormatter: (p) => (p.value == null ? '—' : money(p.value, trip.currency)) },
    { headerName: '', colId: 'actions', width: 330, cellRenderer: ActionsCell, sortable: false, filter: false },
  ], [trip.currency, trip.members]);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: false, filter: true, resizable: true }), []);
  const context = useMemo<GridCtx>(() => ({ pay: setPaying, act: ctx.act }), [ctx.act]);
  const mine = rows.filter((r) => r.isMe && payable(r));
  // Once PayPal confirms (seen on the next 2 s poll) the row leaves this grid for Spending: close the panel and say so.
  const payingBill = paying && trip.previews.find((p) => p.id === paying.previewId);
  if (paying && (!payingBill || !payingBill.frozen)) setPaying(null); // split again or deleted while the panel was open
  else if (paying && payingBill && payingBill.shares[paying.member].status === 'captured') { // state adjusted during render, per React docs
    setPaidMsg(`Payment successful: your share of ${paying.bill} is paid. It’s now in the Spending list below.`);
    setPaying(null);
  }

  return (
    <section aria-labelledby="bills-h" className="card">
      <div className="between" style={{ alignItems: 'center' }}>
        <div className="col" style={{ gap: 2 }}>
          <span className="eyebrow" style={{ color: 'var(--orange-ink)' }}>Action required</span>
          <h2 id="bills-h" style={{ fontSize: 20 }}>Payments due</h2>
          <span className="small muted">Unpaid shares only. Once a payment goes through it moves to the Spending list below. Split again sends a bill back to Split bills; Delete needs everyone on the bill, or just the person paying 100%.{mine.length ? ` You have ${mine.length} to pay.` : ''}</span>
        </div>
      </div>
      {paidMsg && (
        <p role="status" className="row small" style={{ gap: 8, margin: 0, background: 'var(--blue-tint)', color: 'var(--brand)', padding: '10px 14px', borderRadius: 10, justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 6 }}><Icon d={icons.check} />{paidMsg}</span>
          <button type="button" className="btn" style={{ minHeight: 32 }} onClick={() => setPaidMsg(null)}>Dismiss</button>
        </p>
      )}
      {rows.length ? (
        <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(p) => p.data.id}
          context={context} domLayout="autoHeight" rowHeight={48} />
      ) : <p className="muted small">Nothing to pay right now.</p>}
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

/** Pay at a store: the member pays the vendor now through PayPal (their PayPal email directly, or a phone number via
 * PayTogether and a Payout). Once PayPal confirms, it goes straight to the Spending list with the split entered here. */
export function StoreBill({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const { trip, me } = ctx;
  // Percent per member as typed; 0 means not on it. Starts equal.
  const [pcts, setPcts] = useState(() => equalBps(trip.members.length).map((b) => String(b / 100)));
  const [paying, setPaying] = useState<{ previewId: string; orderId: string; cents: number; payee?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bps = trip.solo ? trip.members.map((_, i) => (i === me ? 10000 : 0)) : pcts.map((v) => Math.round((parseFloat(v) || 0) * 100));
  const sum = bps.reduce((a, b) => a + b, 0);
  const done = paying && trip.txs.some((x) => x.id.startsWith(`${paying.previewId}-`) && x.status === 'logged');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const total = Math.round(parseFloat(String(f.get('total'))) * 100);
    const contact = String(f.get('contact')).trim();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ trip: Trip; previewId: string }>(`/trips/${trip.id}/store-pay`, { body: { vendor: String(f.get('vendor')).trim(), contact, total, category: f.get('category'), bps } });
      const p = r.trip.previews.find((x) => x.id === r.previewId);
      const orderId = p?.shares[me].order_id;
      if (orderId) setPaying({ previewId: r.previewId, orderId, cents: total, payee: p?.payee?.email });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return (
    <p role="status" className="row small" style={{ gap: 8, margin: 0, background: 'var(--blue-tint)', color: 'var(--brand)', padding: '10px 14px', borderRadius: 10, justifyContent: 'space-between' }}>
      <span className="row" style={{ gap: 6 }}><Icon d={icons.check} />Payment successful. It’s in the Spending list below.</span>
      <button type="button" className="btn" style={{ minHeight: 32 }} onClick={onDone}>Done</button>
    </p>
  );
  if (paying) return (
    <div className="col" style={{ gap: 10, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <strong>Pay {money(paying.cents, trip.currency)}</strong>
      <PayShare key={paying.orderId} ctx={ctx} previewId={paying.previewId} orderId={paying.orderId} payee={paying.payee} currency={trip.currency} autoOpen label={`Pay ${money(paying.cents, trip.currency)}`} />
      <span className="small muted">Once PayPal confirms, it goes straight to the Spending list. If you close this, you can still pay it from Payments due.</span>
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={onDone}>Close</button>
    </div>
  );
  return (
    <form onSubmit={submit} className="col" style={{ gap: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <p className="small muted">Pay the vendor now with PayPal. A PayPal email is paid directly; a phone number is paid through PayTogether. Once it’s paid it goes straight to the Spending list.{trip.solo ? '' : ' The others owe you their share (Dashboard → settle up).'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label className="field">Store<input name="vendor" required maxLength={60} placeholder="Pho 24" /></label>
        <label className="field">Vendor’s PayPal email or phone<input name="contact" required maxLength={254} placeholder="pay@store.com or +1 408 555 1234" autoComplete="off" /></label>
        <label className="field">Total ({trip.currency})<input name="total" inputMode="decimal" required pattern="\d+(\.\d{1,2})?" placeholder="42.50" /></label>
        <label className="field">Type<select name="category">{['Restaurant', 'Store', 'Transport', 'Tickets', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      {!trip.solo && (
        <fieldset className="col" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
          <legend className="field" style={{ marginBottom: 6 }}>Split (0% = not on it)</legend>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {trip.members.map((m, i) => (
              <label key={i} className="row" style={{ gap: 6, fontSize: 14, minHeight: 44 }}>
                <span style={{ color: m.color }}>{m.symbol}</span>{m.name}{i === me ? ' (you)' : ''}
                <input value={pcts[i]} inputMode="decimal" aria-label={`${m.name}'s share in percent`} style={{ width: 70, minHeight: 40, border: '1px solid var(--input)', borderRadius: 10, padding: '0 8px' }}
                  onChange={(e) => setPcts((p) => editPct(p, i, e.target.value))} />%
              </label>
            ))}
          </div>
          {sum !== 10000 && <p role="alert" className="small" style={{ color: 'var(--orange-ink)', margin: 0 }}>Shares add up to {pct(sum)}; they need to total 100%.</p>}
        </fieldset>
      )}
      {error && <p role="alert" className="small" style={{ color: 'var(--orange-ink)', margin: 0 }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={sum !== 10000 || busy}>{busy ? 'Starting PayPal…' : 'Pay'}</button>
      </div>
    </form>
  );
}
