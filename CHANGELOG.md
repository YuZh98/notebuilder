# Changelog

Notable changes, following [Keep a Changelog](https://keepachangelog.com/). The notebook JSON
interchange format is versioned separately and migrated on import.

## [0.2.0] — 2026-07-23

NoteBuilder becomes a native macOS desktop app (`v2/`): Svelte 5 + TypeScript + Tauri 2, backed by
SQLite. Rebuilds the full prototype experience on a typed engine and moves it forward.

- **Slot → CardType → CardInstance** model: design slot arrangements in the Factory, seal them as
  card types, stamp independent copies into notebooks.
- **11 slots** — text, list, code, table, image, choice, slider, text input, compute, chart,
  progress — composed on a 12-column grid with per-slot resize and fusing.
- **Card-scoped variables** with a topologically sorted dependency graph; cycles and missing
  writers are rejected at import.
- **Hard Edit/Study separation** (`Cmd+Enter`); Study is the live, interactive render.
- **Three state layers**: document (persists + exports), reader state (persists locally, never
  exports), session (transient).
- **Sharing**: notebook JSON, or a self-contained Reader `.html` that opens offline in any browser
  with read-locked content and a Remix unlock.
- **Authoring comfort**: full undo/redo, one pointer-based drag engine (cards, slots, tags,
  services), sidebar inspector, tags with author-controlled order and a coverage matrix, themes,
  GFM markdown + KaTeX, native print.

## [0.1.0] — 2026-06

The original prototype (repository root): a single-file web app — vanilla JS, localStorage, the
whole product shipped as one self-contained `index.html`. Introduced reactive cards, card-scoped
variables, per-reader progress, and one-file HTML sharing with Reader/Remix. Legacy; superseded by
0.2.0.
