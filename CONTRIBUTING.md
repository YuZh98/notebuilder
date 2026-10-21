# Contributing to NoteBuilder

## Scope

NoteBuilder is one repo, two apps: the **v1 prototype** at the root (frozen, bug fixes only) and the
**v2 product** in `v2/` (Svelte 5 + TypeScript + Tauri 2, active development).

In scope: v2 app quality, interchange/Reader fidelity, tests, and docs accuracy.

Out of scope: anything that adds a network call, telemetry, or an account system (NoteBuilder is
local-first and stays that way); changes to the v1 root beyond bug fixes; features not grounded in an
open issue.

Thanks for helping. Active development happens in **`v2/`** (Svelte 5 + TypeScript + Tauri 2); the
repository root is the legacy single-file prototype, kept building but not evolving.

## Setup (v2 — the app)

```bash
cd v2
npm install
npm run dev          # browser dev server (persistence no-ops; demo notebook loads)
npm run tauri dev    # the real desktop app — needs Rust + Xcode CLT
```

Gates — keep all green before and after every change:

```bash
npm test             # Vitest unit suite
npm run check        # svelte-check, TypeScript strict
npm run build        # Vite production build
npm run build:reader # only when the Reader render path changes — commit the regenerated template
```

## The shape of v2

- Architecture map: Part B of [`docs/CODE-MAP.md`](docs/CODE-MAP.md).
- **Invariants** (don't break): variables are card-scoped, never cross a card boundary; three state
  layers (document persists + exports · reader state persists locally, never exports · session is
  transient); slot structure is sealed outside the Factory; every drag rides the one pointer engine
  in `v2/src/lib/drag/` — no native HTML5 drag outside the Factory inventory chips; no `eval` on
  user content, escape-first before any
  `{@html}`; every document edit is undoable.
- **Migrations always.** A change to the SQLite shape ships a migration in
  `v2/src-tauri/src/lib.rs`; a change to the JSON interchange shape bumps its schema version and
  ships an import migration. Old saves and old exports must still load.
- **Behavior changes are test-driven** — add a failing test, then make it pass. Verify UI and
  interaction changes by running the app, not by reading the diff.

## Legacy prototype (root)

Edit `src/`, never the generated `index.html`; `npm run build` regenerates it, `npm test` runs the
Playwright suite (needs Node 20+ and Python 3 for the static server). Same invariants as above,
minus SQLite.

## Commits & PRs

- Conventional Commits: `feat` · `fix` · `schema` · `refactor` · `test` · `docs` · `chore` (use
  `schema` when the change alters a persisted or interchange data shape). Subject ≤ 72 chars,
  imperative; body explains *why*.
- Describe *what changed*, not how it was produced.
- CI must be green before merge.
