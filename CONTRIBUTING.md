# Contributing to NoteBuilder

Thanks for helping. NoteBuilder is a single-file app built from modular source.

## Setup

```bash
npm install
npm run dev      # build + serve at http://localhost:8950
```

Requires Node 20+ and **Python 3** (`npm run dev` and `npm test` serve the built file with
`python3 -m http.server`). On a machine without Python, serve `index.html` with any static server and
point Playwright's `baseURL` at it.

## The shape of the code

- Edit **`src/`**, never the generated `index.html`. Source is split by layer under `src/app/` (build
  order = numeric prefix), plus `src/styles.css` and the vendored `src/vendor/katex.js`.
- `npm run build` concatenates source → `index.html`. The architecture map is
  [`docs/CODE-MAP.md`](docs/CODE-MAP.md); the build rationale is
  [`docs/adr/0001-modular-build.md`](docs/adr/0001-modular-build.md).

## Working rules

- **Behavior changes are test-driven.** Add a failing Playwright spec under `tests/`, then make it pass.
  `npm test` rebuilds, serves, and runs the suite — keep it green before and after every change.
- **Migrations always.** Any change to saved data shape ships a migration in the same change; old saves
  and old exports must still load. Import applies the same migrations as load.
- **Invariants** (don't break): three study-state layers (document persists+exports · progress persists
  locally, never exports · presentation is session-only); variables are card-scoped; slot structure is
  sealed (add/remove only in the Factory); no `eval`, escape-first; every document edit is undoable.
- **Verify visually** for UI/interaction changes — run it in the browser, don't trust the diff alone.

## Commits & PRs

- Conventional Commits: `feat` · `fix` · `schema` · `refactor` · `test` · `docs` · `chore` (use
  `schema` when the change bumps the notebook data format / ships a migration). Subject ≤ 72 chars,
  imperative; body explains *why*.
- Describe *what changed*, not how it was produced.
- CI must be green (build · lint · format · tests) before merge.
