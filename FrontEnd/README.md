# PayTogether FrontEnd

Three parts:

| Folder | What it is |
|---|---|
| [`shared/`](shared/) | Plain TypeScript with **no imports and no dependencies**: the trip model and types shared with the Backend, integer-cents split math, timeline validation, settlement, search and rollups. Vite, Metro and `node --test` all load it as-is. |
| [`web/`](web/) | The PayTogether web app: Vite + React 19 + TypeScript. This is the app judges use. |
| [`mobile/`](mobile/) | Expo SDK 58 + React Native 0.88 prototype running on sample data. |

See the [root README](../README.md) for the product overview and [`../Backend/README.md`](../Backend/README.md) for the API.

## shared/

- **Money:** integer cents and basis points summing to 10,000. `largestRemainder` gives each share `floor(total × bp / 10000)` cents and hands the leftover cents to the largest remainders, so shares always add up to the total ($187.45 ÷ 4 → $46.87 + $46.86 + $46.86 + $46.86).
- **Splits:** `rebalanceShares` (a member sets their share, the others rebalance in proportion), `equalBps`, `shareAmounts`.
- **Timeline:** `validateTimeline`, `fitNights`, `rebalanceNights` (trip length stays fixed).
- **Settlement and rollups:** `balances`, `settle` (fewest transfers), `mySummary` (home page), `tripStatus`, `payStage` (Awaiting payment → Verifying → Paid).
- **Search:** `searchTxns` (e.g. `hotel > 100`), the fallback when Elasticsearch is off.

```bash
cd FrontEnd && node --test shared/
```

## web/

### Run

```bash
cd FrontEnd/web
npm install
npm run dev        # http://localhost:5173, proxies /api to the Backend on :8787
npm run build      # tsc -b && vite build → dist/
npm run lint       # oxlint
```

Start the Backend first (`cd Backend && npm run dev`). Vite is pinned to port **5173** (`strictPort`) because Log in with PayPal returns to that exact Return URL.

### Environment

| Variable | Where | Purpose |
|---|---|---|
| `API_URL` | `web/.env.local` (dev server only) | Proxy target for `/api` (default `http://localhost:8787`; can be the Render API) |
| `API_TOKEN` | `web/.env.local` (dev server only) | Sent as `x-access-token` by the dev proxy when the API has `ACCESS_TOKEN` set; never reaches the browser |
| `VITE_API_URL` | build time | The API's URL for a deployed build (calls it cross-origin) |
| `VITE_AG_GRID_LICENSE` | build time | Removes the AG Grid Enterprise watermark (optional) |
| `VITE_BRYNTUM_LICENSE` | build time | Removes the Bryntum trial badge (optional) |

### Screens

Hash routes: `#/` (landing when signed out, home when signed in), `#/home`, `#/trips`, `#/new`, `#/join`, `#/setup/{id}`, `#/trip/{id}/{plan|schedule|spending|dashboard}`. The open trip polls the API every 2 seconds.

| File | Screen |
|---|---|
| [`src/App.tsx`](web/src/App.tsx) | Hash routing |
| [`src/Entry.tsx`](web/src/Entry.tsx) | Landing page and Log in with PayPal |
| [`src/Home.tsx`](web/src/Home.tsx) | Home dashboard (spent, pending, bills to accept, invites, recent charges), trips list, new/join trip, group setup (join code, invite by PayPal email) |
| [`src/Plan.tsx`](web/src/Plan.tsx) | Plan tab: Wayfinder group chat, phase stepper, destinations, timeline, polls |
| [`src/Spending.tsx`](web/src/Spending.tsx) | Spending tab: split bills and payments due, transactions grid (AG Grid), Paid at a store, search |
| [`src/Bills.tsx`](web/src/Bills.tsx) | Split bills (each member sets their own share, accepts) and Payments due (AG Grid, Pay / Split again / Delete per row) |
| [`src/Shop.tsx`](web/src/Shop.tsx) | Channel3 product search; Go to split bill turns a product into an equal split |
| [`src/Schedule.tsx`](web/src/Schedule.tsx) | Schedule tab (Bryntum Scheduler): stops row + one row per member, payments with their PayPal stage; double-click your row to log an expense |
| [`src/Dashboard.tsx`](web/src/Dashboard.tsx) | Dashboard tab (AG Charts): spend per member, per stop, per type |
| [`src/ui.tsx`](web/src/ui.tsx) | Shared UI: phase stepper, split bars, PayPal Buttons (`loadSdk`, one `data-namespace` per SDK URL), chat text with KaTeX |
| [`src/api.ts`](web/src/api.ts) | API client: base URL, `x-session` header, session in `localStorage`, `startLogin` |

### PayPal in the browser

- **Log in with PayPal:** the landing page sends the user to PayPal's login URL from `/api/config`; the returned code goes to `POST /api/auth/paypal`, and the signed session is kept for the `x-session` header.
- **Pay my share:** the Pay button first calls `POST /api/trips/{id}/previews/{pid}/pay` to get a live order for *this member's* share, then renders PayPal Buttons for it. A store bill loads the SDK with `merchant-id=<store email>` so it matches the order's payee.
- The browser never marks anything paid: status comes from the server (webhook or server-side capture).

### Libraries

React 19, Vite 8, TypeScript, AG Grid Enterprise 36 + AG Charts 14, Bryntum Scheduler 8 Enterprise (`@bryntum/scheduler-enterprise`, `@bryntum/scheduler-react-enterprise`, `@bryntum/core-enterprise` pinned to the same version; `build.cssTarget` in `vite.config.ts` keeps its theme colors), KaTeX, oxlint.

### Deploy

`paytogether-web` in [`../render.yaml`](../render.yaml) is a Render static site built from the repo root (`cd FrontEnd/web && npm ci --include=dev && npm run build`, publishing `FrontEnd/web/dist`). Set `VITE_API_URL` to the API's URL, and add the site's URL (no trailing slash) as a Return URL in the PayPal app.

## mobile/

```bash
cd FrontEnd/mobile
npm install
npx expo start      # dev server
npx tsc --noEmit    # typecheck
```

Runs the sample trip from `shared/trip.ts`; Wayfinder replies come from the keyword stand-in `wayfinderReply()`. Connecting it to the Backend API is next. Add packages with `npx expo install`.
