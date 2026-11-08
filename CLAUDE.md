# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The FrontEnd has web and mobile clients built from the Claude Design canvas (https://claude.ai/artifact/7mzMmkDDNxxaebhB2YGmpa). They run on sample data in `FrontEnd/shared/trip.ts`. `Backend/` and `AI/` are still placeholders. Product rules and invariants live in `claudee.md` and `AI/ai.md`.

## FrontEnd

- `FrontEnd/shared/trip.ts`: plain TS with no imports and no deps. It holds the sample trip, the integer-cents split math (largest remainder, basis points summing to 10000), the transaction search and the dashboard rollups. Both apps import it by relative path; keep it import-free so Vite, Metro and `node --test` all load it.
- `FrontEnd/web/`: Vite + React 19 + TS, hash routes `#/`, `#/trips`, `#/trip/{plan|schedule|spending|dashboard|shop}`. `vite.config.ts` allows `..` so dev can serve `shared/`.
- `FrontEnd/mobile/`: Expo SDK 58 + React Native 0.88. It uses state-based navigation in `App.tsx`; screens are in `src/Core.tsx` and `src/Money.tsx`. `metro.config.js` adds `../shared` to `watchFolders`. Add packages with `npx expo install`.

Commands:
```
cd FrontEnd && node --test shared/            # money/search tests (single test: --test-name-pattern "<name>")
cd FrontEnd/web && npm run dev | npm run build | npm run lint
cd FrontEnd/mobile && npx expo start | npx tsc --noEmit
```

No API contract exists yet. When Backend lands, replace the `initial*` sample data with fetches and document ports and env vars here.

## Layout

The repo is a monorepo split into three top-level areas, each currently holding only an empty placeholder markdown file:

- `FrontEnd/`: client app (placeholder: `frontemd.md`)
- `Backend/`: server/API (placeholder: `backend.md`)
- `AI/`: AI/ML component (placeholder: `ai.md`)

The root `.gitignore` is the standard Node.js template, which suggests a JS/TS stack, but nothing has been chosen yet.

## Keeping this file current

When a stack is added to any area, update this file with that area's build, lint, test, and single-test commands, plus how the three areas talk to each other (API contracts, ports, env vars).
