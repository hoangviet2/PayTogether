# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

PayTogether is at the scaffold stage: no source code, build tooling, dependencies, or tests exist yet. Don't assume a framework or language; check what has been added before running commands.

## Layout

The repo is a monorepo split into three top-level areas, each currently holding only an empty placeholder markdown file:

- `FrontEnd/`: client app (placeholder: `frontemd.md`)
- `Backend/`: server/API (placeholder: `backend.md`)
- `AI/`: AI/ML component (placeholder: `ai.md`)

The root `.gitignore` is the standard Node.js template, which suggests a JS/TS stack, but nothing has been chosen yet.

## Keeping this file current

When a stack is added to any area, update this file with that area's build, lint, test, and single-test commands, plus how the three areas talk to each other (API contracts, ports, env vars).
