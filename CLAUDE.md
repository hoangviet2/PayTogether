# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The web app is a first-time flow backed by `Backend/`. A user creates a trip, tells Wayfinder (OpenAI) where to go in the chat, and the group walks the `AI/ai.md` phases (Destinations → Timeline → Places → Pricing → Booked → On trip → Settled). The mobile app still runs on the sample trip in `FrontEnd/shared/trip.ts`. Product rules and invariants live in `claudee.md` and `AI/ai.md`. The stack is not the Next.js/Postgres one `claudee.md` describes: it is Vite + a small node:http server with a JSON file store.

## Backend (`Backend/`, port 8787)

- `src/server.ts`: node:http routes under `/api`; Zod validates every body. Who is calling comes from the signed `x-session` header issued by `POST /api/auth/paypal` (Log in with PayPal, authorization code → userinfo); a member is the trip seat whose `user` is that PayPal id. Friends join with the trip's 6-character code (`POST /api/join`), open until Pricing.
- `src/store.ts`: trip state and every rule-bearing mutation (quorum confirms, poll ties, own-split-only edits, webhook-only payment status). Persists to `Backend/data.json`.
- `src/wayfinder.ts`: one OpenAI Responses API turn per chat message or event, with a hand-written tool loop (Zod-checked arguments, max 20 steps). Tools are phase-gated per `ai.md` §4; places come from the built-in `web_search` tool. `gpt-5.5` for turns, `gpt-5.4-mini` for should-reply. Needs `OPENAI_API_KEY`.
- `src/integrations.ts`: PayPal Orders v2 + webhook verification, Log in with PayPal + HMAC sessions (`SESSION_SECRET`), Channel3, Kernel, Elasticsearch. Each one is off (HTTP 503 naming the missing variable) until its keys are in `Backend/.env`; see `.env.example`.
- Payment status changes only in `POST /api/paypal/webhook`, so local dev needs a public tunnel to receive PayPal webhooks.
- Deploy: `render.yaml` (Render Blueprint) builds from the repo root because the server imports `FrontEnd/shared/`. It uses a paid instance with a disk at `/var/data` (`DATA_FILE`), since free instances wipe the filesystem. `ACCESS_TOKEN` gates every route except `/api/config` and the PayPal webhook; the web dev proxy sends it from `FrontEnd/web/.env.local` (`API_URL`, `API_TOKEN`).

## FrontEnd

- `FrontEnd/shared/trip.ts`: plain TS with no imports and no deps. It holds the sample data (mobile), the live trip model and types shared with Backend, the integer-cents split math (largest remainder, basis points summing to 10000), timeline validation, settlement, search and rollups. Keep it import-free so Vite, Metro and `node --test` all load it.
- `FrontEnd/web/`: Vite + React 19 + TS. Hash routes `#/`, `#/trips`, `#/trip/{id}/{plan|schedule|spending|dashboard|shop}`. `vite.config.ts` proxies `/api` to the Backend (`API_PORT`, default 8787) and allows `..` for `shared/`. AG Grid 36 (Enterprise row grouping; set `VITE_AG_GRID_LICENSE` in `web/.env.local` to remove the watermark) and AG Charts 14. The trip polls every 2 s.
- `FrontEnd/mobile/`: Expo SDK 58 + React Native 0.88, sample data only. Its Wayfinder replies come from the keyword stand-in `wayfinderReply()` in `shared/trip.ts`; switch it to the Backend API next. Add packages with `npx expo install`.

Commands:
```
cd Backend && npm install && npm run dev        # API on :8787 (reads Backend/.env)
cd Backend && npm test | npm run typecheck      # store rules (single test: npm test -- --test-name-pattern "<name>")
cd FrontEnd && node --test shared/              # money/timeline/search tests
cd FrontEnd/web && npm run dev | npm run build | npm run lint
cd FrontEnd/mobile && npx expo start | npx tsc --noEmit
```

## Keeping this file current

When a stack is added to any area, update this file with that area's build, lint, test, and single-test commands, plus how the three areas talk to each other (API contracts, ports, env vars).
