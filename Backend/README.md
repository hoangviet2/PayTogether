# PayTogether Backend

The PayTogether API: a small Node.js `node:http` server (no framework) that owns every trip, runs Wayfinder (the AI trip host), and talks to PayPal and the sponsor services. It listens on **port 8787**, serves only `/api/*`, and stores data in a JSON file.

See the [root README](../README.md) for the product overview and [`CLAUDE.md`](../CLAUDE.md) for invariants.

## Quick start

```bash
cd Backend
npm install
cp .env.example .env     # fill in at least PAYPAL_* and OPENAI_API_KEY
npm run dev              # http://localhost:8787, restarts on change
```

Requires **Node.js 24**: the `.ts` files run directly with Node's type stripping (no build step).

| Script | What it does |
|---|---|
| `npm run dev` | Start with `--watch`, reading `.env` if present |
| `npm start` | Start once (used on Render) |
| `npm test` | `node --test src/` with an in-memory store (`DATA_FILE=:memory:`) |
| `npm test -- --test-name-pattern "<name>"` | Run one test |
| `npm run typecheck` | `tsc --noEmit` |

## Files

| File | Role |
|---|---|
| [`src/server.ts`](src/server.ts) | HTTP routes under `/api`, Zod validation of every body, auth (`x-session`, `ACCESS_TOKEN`), CORS, PayPal webhook, `applyStatus` (payment status from PayPal only) |
| [`src/store.ts`](src/store.ts) | Trip state and every rule-bearing mutation: phases and quorum confirms, polls and ties, split bills (`rebalanceShares`, accept, delete votes), auto-pricing on entering Pricing, store bills, logged expenses. Persists to `data.json` (+ `*.users.json` for known PayPal accounts) |
| [`src/wayfinder.ts`](src/wayfinder.ts) | Wayfinder: OpenAI Responses API turn with a hand-written tool loop (max 20 steps), Zod-checked tool arguments, phase-gated tools (`toolsFor`), `shouldReply` classifier |
| [`src/integrations.ts`](src/integrations.ts) | PayPal (OAuth token, Orders v2, Payouts, webhook verification), Log in with PayPal + HMAC sessions, Channel3, Kernel, Elasticsearch. Each is off (HTTP 503 naming the missing variable) until its keys are set |
| [`src/workflows.ts`](src/workflows.ts) | `offload()`: runs a job on Render Workflows when `RENDER_API_KEY` is set, otherwise in-process; falls back to in-process if a run fails |
| [`src/tasks.ts`](src/tasks.ts) | Render Workflows tasks: `wayfinder-turn`, `should-reply`, `search-products`, `open-checkout`, `close-checkout`, `paypal-orders`, `index-txns` |
| `src/*.test.ts` | Store rules, sessions, Wayfinder tools |

The trip model, split math (integer cents, basis points, largest remainder) and settlement live in [`../FrontEnd/shared/trip.ts`](../FrontEnd/shared/trip.ts), shared with the web app. That's why Render builds this service from the repo root.

## Environment

All variables are listed with comments in [`.env.example`](.env.example).

| Variable | Needed for |
|---|---|
| `OPENAI_API_KEY` | Wayfinder (without it the chat says it is offline) |
| `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Log in with PayPal and all payments (`sandbox` or `live`) |
| `PAYPAL_WEBHOOK_ID` | Verifying webhooks |
| `SESSION_SECRET` | Signing sessions (unset: sessions end on restart) |
| `CHANNEL3_API_KEY` | Product search |
| `KERNEL_API_KEY` | Cloud-browser checkout |
| `ELASTIC_URL`, `ELASTIC_API_KEY` | Transaction search (falls back to in-process search) |
| `RENDER_API_KEY`, `RENDER_WORKFLOW_SLUG` | Running jobs on Render Workflows |
| `ACCESS_TOKEN` | Gating the API on a public host |
| `WEB_ORIGIN` | CORS allow-list (comma-separated web origins) |
| `API_HOSTPORT` | Workflow tasks calling back to the API over the private network |
| `PORT`, `DATA_FILE` | Port (default 8787) and store path (default `data.json`) |

## API

Every route except `GET /api/config`, `POST /api/auth/paypal` and `POST /api/paypal/webhook` needs either a valid `x-session` (from Log in with PayPal) or `x-access-token: $ACCESS_TOKEN`. A caller is a trip member when a seat's `user` is their PayPal id.

| Route | Purpose |
|---|---|
| `GET /api/config` | Public config: PayPal client id, login URL, which integrations are on (health check) |
| `POST /api/auth/paypal` | Exchange the Log in with PayPal code for a signed session |
| `GET /api/trips`, `POST /api/trips` | List my trips (with `mine` summary for home) / create a trip (solo or group) |
| `POST /api/join` | Join a group trip by its 6-character code (open until Pricing) |
| `GET /api/invites`, `POST /api/trips/{id}/invite\|accept\|decline` | Invite an account by PayPal email; accept or decline |
| `GET /api/trips/{id}`, `DELETE /api/trips/{id}`, `POST /api/trips/{id}/leave` | Read, delete (owner, before any PayPal request), leave (before Pricing) |
| `POST /api/trips/{id}/messages` | Chat message; may trigger a Wayfinder turn |
| `POST /api/trips/{id}/confirm` | Confirm the current phase (all members must) |
| `POST /api/trips/{id}/legs` | Edit the timeline |
| `POST /api/trips/{id}/polls/{pid}/vote\|options\|close` | Vote, add an option, close a poll |
| `POST /api/trips/{id}/previews/{pid}/ratio\|equal\|accept` | Set my share, reset to equal, accept the split |
| `POST /api/trips/{id}/previews/{pid}/pay\|capture` | Get (or replace an expired) PayPal order for my share; capture an approved one |
| `POST /api/trips/{id}/previews/{pid}/split-again\|delete` | Back to splitting; vote to delete (refused once a share is approved or paid) |
| `POST /api/trips/{id}/purchases` | Turn a Channel3 product into an equal split bill |
| `POST /api/trips/{id}/store-bills` | Bill paid to a store's PayPal (`payee.email_address`) after everyone accepts |
| `POST /api/trips/{id}/store-pay` | Pay a vendor now (PayPal email as payee, or phone via Payouts), then split |
| `POST /api/trips/{id}/txns` | Log an expense (already paid / just planned / only me) |
| `GET /api/trips/{id}/search?q=` | Transaction search (Elasticsearch, trip-scoped; local fallback) |
| `GET /api/products?q=&max=&currency=` | Channel3 product search |
| `POST /api/checkout`, `DELETE /api/checkout/{session}` | Open / close a Kernel browser session (not used by the web app) |
| `POST /api/paypal/webhook` | PayPal webhook: signature-verified, deduplicated by event id |
| `POST /api/internal/trips/{id}/context\|tool` | Workflow callbacks; `ACCESS_TOKEN` only |

## Payments

1. When everyone on a bill accepts, the server creates **one Orders v2 order per member share** with `PayPal-Request-Id` (on the `paypal-orders` workflow task when Render Workflows is on).
2. The member opens Pay: `POST .../pay` replaces an order PayPal has expired and captures one already approved.
3. The member approves it with the PayPal JS SDK in the browser.
4. Status changes only from PayPal: the verified webhook (`CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`) or the server's own capture/order lookup. So a payment shows as Paid even without a webhook tunnel.
5. Captured shares become transactions and are indexed in Elasticsearch.

For local webhooks, tunnel to `http://localhost:8787/api/paypal/webhook` (e.g. `ngrok http 8787`) and subscribe the four events above in the PayPal app.

## Wayfinder

- `gpt-5.5` for turns, `gpt-5-mini` for "should it reply?"; an `@wayfinder` mention always gets a reply.
- Tools by phase: `get_trip_state` and `search_products` always; `update_trip`, `set_stops`, `set_nights` before Pricing; `propose_destinations`, `draft_timeline`, `validate_timeline`, `create_poll`, `enrich_option`, `build_price_preview` while planning; `get_schedule`, `query_transactions`, `get_balances`, `suggest_settlement` later; OpenAI `web_search` in Destinations and Places.
- No tool moves money or edits a split.
- After Places is confirmed, app events no longer trigger turns; members can still ask in the chat.
- With Render Workflows on, `wayfinder-turn` runs the model loop remotely and reads or changes the trip through `/api/internal/trips/{id}/context|tool`.

## Deploy

[`../render.yaml`](../render.yaml) defines `paytogether-api` (this server, paid instance with a disk at `/var/data`, `DATA_FILE=/var/data/data.json`) and `paytogether-workflows` (`node src/tasks.ts`, same region). Local task server: `render workflows dev -- node src/tasks.ts` (Render CLI ≥ 2.35).
