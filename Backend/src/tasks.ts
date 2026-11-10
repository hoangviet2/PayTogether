// Render Workflows entry point: service paytogether-workflows (render.yaml), start command `node src/tasks.ts`.
// Each run gets its own instance. Trip state lives on the API's disk, so Wayfinder reads and changes it through the
// API's /api/internal routes over Render's private network, authenticated with the API's ACCESS_TOKEN.
import { task, type TaskContext } from '@renderinc/sdk/workflows';
import type { Person, Txn } from '../../FrontEnd/shared/trip.ts';
import { createOrder, indexTxn } from './integrations.ts';
import { modelLoop, type TurnContext } from './wayfinder.ts';

async function callApi<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`http://${process.env.API_HOSTPORT}/api/internal${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-token': process.env.ACCESS_TOKEN ?? '' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${path} answered ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

// No retries: tool calls write to the trip (polls, previews), so a rerun could duplicate them. The OpenAI client retries its own calls.
task({ name: 'wayfinder-turn', retry: { maxRetries: 0, waitDurationMs: 1000 }, timeoutSeconds: 600 },
  async function wayfinderTurn(_ctx: TaskContext, tripId: string, trigger: string): Promise<string> {
    const trip = `/trips/${encodeURIComponent(tripId)}`;
    const ctx = await callApi<TurnContext>(`${trip}/context`, { trigger });
    return modelLoop(ctx, async (name, args) => (await callApi<{ output: string }>(`${trip}/tool`, { name, args })).output);
  });

// Safe to retry (default policy): each order carries a PayPal-Request-Id, so PayPal returns the same order instead of a new one.
task({ name: 'paypal-orders', timeoutSeconds: 120 },
  async function paypalOrders(_ctx: TaskContext, orders: Parameters<typeof createOrder>[0][]): Promise<string[]> {
    return Promise.all(orders.map(createOrder));
  });

// Safe to retry: documents are indexed by id, so a rerun overwrites.
task({ name: 'index-txns', timeoutSeconds: 120 },
  async function indexTxns(_ctx: TaskContext, tripId: string, rows: Txn[], people: Pick<Person, 'name'>[]): Promise<number> {
    await Promise.all(rows.map((r) => indexTxn(tripId, r, people)));
    return rows.length;
  });
