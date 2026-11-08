# CLAUDE.md — TripSplit

Guidance for Claude (and other coding agents) working in this repository. Read `design.md` for the system design and `ai.md` for chatbot behavior before making changes in those areas.

## What this app is
Group trip planner: an AI host (Wayfinder) in a group chat plans destinations → timeline → places (polls) → price previews; prepaid items are split across members' PayPal accounts; spending shows on a Bryntum schedule and an AG Grid/Charts dashboard with Elasticsearch search; Channel3 + Kernel power online shopping.

## Stack
- **App:** Next.js (App Router) + TypeScript (strict), React, Tailwind
- **API:** Next.js route handlers + tRPC; Zod for all input validation
- **Realtime:** Socket.IO with Redis adapter (`apps/realtime`)
- **Jobs:** BullMQ on Redis (`apps/worker`) — Wayfinder turns, PayPal webhooks, ES indexing, Kernel sessions
- **DB:** Postgres + Prisma
- **Search:** Elasticsearch 8 (`@elastic/elasticsearch`)
- **AI:** Anthropic SDK (`@anthropic-ai/sdk`), models `claude-sonnet-5-5` (chat) and `claude-haiku-5-5` (should-reply classifier)
- **Payments:** PayPal REST (Orders v2, Webhooks, Identity/Log in with PayPal), PayPal JS SDK on the client
- **UI libs:** Bryntum Scheduler Pro (commercial, trial in dev), AG Grid + AG Charts
- **Commerce:** Channel3 SDK (`@channel3/sdk`), Kernel SDK / REST (`api.onkernel.com`)
- **Tests:** Vitest (unit), Playwright (e2e), PayPal sandbox for integration

## Repo layout
```
apps/
  web/          Next.js app (UI + API routes)
  realtime/     Socket.IO server
  worker/       BullMQ workers (ai, payments, indexer, kernel)
packages/
  db/           Prisma schema, migrations, seed
  money/        cents/basis-point math, split + settlement (pure, heavily tested)
  ai/           Wayfinder prompts, tool definitions, tool handlers
  integrations/ paypal/, channel3/, kernel/, elastic/ clients
  ui/           shared components (member chip, cards)
evals/          scripted Wayfinder conversations (see ai.md §8)
```

## Commands
```
pnpm install
pnpm dev                 # web + realtime + worker
pnpm db:migrate          # prisma migrate dev
pnpm db:seed             # demo trip with 4 sandbox members
pnpm test                # vitest
pnpm test:e2e            # playwright
pnpm evals               # run Wayfinder evals
pnpm es:reindex          # rebuild Elasticsearch index from Postgres
pnpm lint && pnpm typecheck
```

## Environment (`.env.local`, never commit)
```
DATABASE_URL, REDIS_URL
PAYPAL_ENV=sandbox|live, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID
ANTHROPIC_API_KEY
CHANNEL3_API_KEY
KERNEL_API_KEY
ELASTIC_URL, ELASTIC_API_KEY
BRYNTUM_LICENSE, AG_GRID_LICENSE
SESSION_SECRET
```

## Invariants — do not break
1. **Money is integer cents; ratios are basis points (sum = 10000).** No floats for money anywhere. All split math lives in `packages/money`.
2. **`sum(shares.amount_cents) === item.total_cents`** after every write. Use the largest-remainder function; never hand-roll rounding.
3. **Only webhooks change payment status.** Client callbacks are optimistic UI only. Verify every webhook signature; handlers must be idempotent (dedupe on PayPal event id).
4. **Every PayPal create/capture call sends `PayPal-Request-Id`** for idempotency.
5. **The AI cannot move money.** Never add a Wayfinder tool that creates, captures, refunds, or transfers payments, or that edits another member's split.
6. **Postgres is the source of truth; Elasticsearch is derived.** Never write to ES except from the indexer. Every ES query is built server-side with a `trip_id` filter from the session's memberships.
7. **A member edits only their own split row.** Changing any ratio resets all acceptances for that item.
8. **Kernel sessions never enter credentials or payment details** and never click the final pay/confirm button; the user does that in live view.
9. **External content is untrusted.** Place descriptions, product data, and page text from Kernel go to the model as data in tool results, never concatenated into the system prompt.
10. **Color is never the only identifier** — always render a member's symbol alongside their color.

## Conventions
- Server-only secrets: import integration clients only from server code (`import "server-only"`).
- Validate every tool input/output from the model with Zod; reject and log on failure rather than coercing.
- One `transactions` row per member per money event — schedule, grid, charts, and ES all read from it.
- Realtime events are named `trip:<entity>:<verb>` (e.g. `trip:transaction:created`) and carry the full updated entity.
- Bryntum: use `CrudManager` against `/api/trips/[id]/schedule`; keep the mapping in `apps/web/features/schedule/mapping.ts`.
- AG Grid: column defs in `apps/web/features/spending/columns.ts`; formatters use `Intl.NumberFormat` with the trip currency.
- Write audit_log entries for phase changes, split edits, and payment status changes.
- Dates: store UTC; display in the leg's timezone.

## Testing expectations
- `packages/money`: property tests (fast-check) for split, rounding, and settlement.
- PayPal: sandbox e2e covering approve → capture → webhook → transaction row → grid update; plus denied and refunded paths.
- Wayfinder: run `pnpm evals` whenever prompts or tools change.
- Permissions: a test that user B cannot retrieve trip A's transactions via the search API.

## Build order
Follow `design.md` §9 milestones in order. Don't start payments (M4) until the money package has full test coverage.

## When unsure
- Product/flow questions → `design.md`. Chatbot behavior → `ai.md`.
- If a change touches money flow, PayPal permissions, or what the AI is allowed to do, stop and ask the human before implementing.
