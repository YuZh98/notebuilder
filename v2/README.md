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

## Orientation

- Architecture map: Part B of [`../docs/CODE-MAP.md`](../docs/CODE-MAP.md) — source layout, data
  shapes, the `SlotType` contract, drag engine, invariants.
- Product spec: [`../docs/spec/v2-spec.md`](../docs/spec/v2-spec.md).
- Interchange format: versioned JSON (`src/lib/json-io.ts`); a shared notebook is a self-contained
  Reader `.html` with the same payload embedded.

Two rules worth knowing before editing: variables are **card-scoped** (never cross a card boundary),
and every drag rides the **one pointer engine** in `src/lib/drag/` — no native HTML5 drag anywhere.
