# NoteBuilder v2

The next generation of NoteBuilder: the same **Factory → seal → notebook → share** product rebuilt as
a **Svelte 5 (runes) + TypeScript** app in a **Tauri 2** desktop shell, backed by **SQLite**. Feature
parity with the shipped v1 (repository root) is complete; current work refines the authoring UX.

## Run it

```bash
npm install
npm run dev          # browser dev server (persistence no-ops; demo notebook loads)
npm run tauri dev    # the real desktop app (SQLite persistence, native print/dialogs)
```

## Develop

| Command | Does |
|---|---|
| `npm test` | Vitest unit suite |
| `npm run check` | svelte-check (TS strict) |
| `npm run build` | Vite production build |
| `npm run build:reader` | Regenerate `src/lib/generated/reader-template.ts` — run whenever the Reader render path changes, and commit the result |

## Design tokens

Every dimension, font size, corner and duration in v2 comes from the `:root` token block in
`src/app.css` — colours and surfaces, plus the spacing scale (`--space-1`…`--space-6`), type roles
(`--fs-2xs`…`--fs-lg`), fixed inner-chrome radii (`--radius-sm/md/lg`, distinct from the
theme-swapped `--radius`) and motion presets (`--t-quick/base/slow`, `--ease-out`). New UI uses those
tokens; if the value you need has no token, extend the token block first rather than writing a
literal. A literal that genuinely cannot be a token must carry a trailing
`/* token-exempt: <reason> */` comment, and 1px hairlines and `0` are exempt by default.

## Orientation

- Architecture map: Part B of [`../docs/CODE-MAP.md`](../docs/CODE-MAP.md) — source layout, data
  shapes, the `SlotType` contract, drag engine, invariants.
- Interchange format: versioned JSON (`src/lib/json-io.ts`); a shared notebook is a self-contained
  Reader `.html` with the same payload embedded.

Two rules worth knowing before editing: variables are **card-scoped** (never cross a card boundary),
and the **one pointer engine** in `src/lib/drag/` drives every notebook and study surface; the Factory inventory chips still use native HTML5 drag.
