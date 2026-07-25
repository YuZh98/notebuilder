# Changelog

Notable changes, following [Keep a Changelog](https://keepachangelog.com/). The notebook JSON
interchange format is versioned separately and migrated on import.

## [Unreleased]

Staged for the next release once a desktop verification pass signs it off.

- **Keyboard-first Study** — a whole study session runs from the keyboard: `j`/`k` (or the arrow
  keys) move a focus ring from card to card, space or `f` flips, `1`-`9` pick an answer option,
  `Enter` submits, `x` ticks the next checklist item, and `Escape` clears the focus. `?` opens a
  shortcut overlay and Study carries a one-line hint under the notebook. The same bindings work
  in a shared Reader file.
- **Cyberpunk (dark green) theme** — phosphor green on near-black with a fixed grid, scanlines,
  neon card glow, hover lift, and mono uppercase headers. Bold, italic, inline code and
  strikethrough take accent colors in Study text under this theme.
- **Syntax-highlighted code slots** — Python and JavaScript keywords, strings, numbers,
  comments and callables get distinct colors via a dependency-free tokenizer; other languages
  render plain.
- **Zoom** — `Cmd/Ctrl` `+`, `-`, `0` scale the whole app between 50% and 200%.
- **Three new builtin card types** — Cheatsheet, Iron Butterfly (a payoff explorer whose
  breakevens and max profit and loss derive from three sliders), and Code Card, each with
  accent varieties. New builtins now seed into existing libraries via a preferences ledger, so
  an old database picks them up without resurrecting types you deleted.
- **Examples** — `docs/examples/grand-tour.json` exercises every slot type in one tutorial;
  `docs/examples/quant-terminal.json` rebuilds the quant-prep-terminal cockpit with chapter
  dividers, tagged flashcards, cheatsheets, a lab section, and per-section service bars.
- **Styled DMG** — the disk image opens as a proper installer window with a
  drag-to-Applications layout; `docs/install-macos.md` documents the build.
- **Simulation test tier** — seeded generative suites cover variable-graph resolution,
  interchange round-trips, progress semantics, and expression evaluation (1477 tests total).
- **Card type binding survives export** — a card stamped from a Factory type now carries its
  `typeId` through JSON export and import, so the coverage matrix keeps its product dimension on
  a round trip. A recipient without that type reads the card as untyped.
- **Design tokens** — spacing, type, radius and motion tokens with a written governance rule;
  components consolidated onto them with zero visual change.

## [0.2.0] — 2026-07-23

NoteBuilder becomes a native macOS desktop app (`v2/`): Svelte 5 + TypeScript + Tauri 2, backed by
SQLite. Rebuilds the full prototype experience on a typed engine and moves it forward.

- **Slot → CardType → CardInstance** model: design slot arrangements in the Factory, seal them as
  card types, stamp independent copies into notebooks.
- **11 slots** — text, list, code, table, image, choice, slider, text input, compute, chart,
  progress — composed on a 12-column grid with per-slot resize and fusing.
- **Card-scoped variables** with a topologically sorted dependency graph; cycles are rejected
  at import and missing writers load with a warning.
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
