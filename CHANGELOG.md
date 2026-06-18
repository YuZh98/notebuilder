# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses a schema version for the notebook
data format (currently **v4**), bumped on breaking data-shape changes.

## [Unreleased]

## [1.0.0] — 2026-06

First public release. NoteBuilder builds reactive explainers and ships them as one offline HTML file.

### Core model
- **Card-scoped variables** — a slider/control, a formula, and a chart in the same card wire together; a
  variable never leaks across cards (schema v2). Import warns on legacy cross-card references.
- **One control slot** — number folded into slider (a hidden bar + empty range = a free number box,
  schema v3).
- **Text does more** — heading folded into text (`## ` markdown); GFM tables render in any text slot.
- **Progress is a per-reader completion meter** (schema v4) — counts finished cards over a
  section / chapter / whole notebook, filtered by tag, showing any of M/N · % · bar; Rollup folded in.
- **Chapters** — a divider is a foldable chapter header that collapses the sections beneath it.

### Sharing
- **Reader mode** — a shared `.html` opens locked to reading (no authoring chrome) with a single
  **Remix** to unlock editing.
- **Slim export** — a shared file carries only the exported notebook, not your catalog or other
  notebooks; the recipient's progress is their own.

### Authoring
- **JSON / AI front door** — create a notebook by pasting JSON, with a copy-paste schema prompt for an
  LLM.
- First run lands in **Study** on a live example card.
- **Share** is the primary action; the value box hugs its value and shows in Edit (WYSIWYG).

### Engineering
- Migrated from a single-file prototype to **modular source bundled into one `index.html`** (see
  `docs/adr/0001-modular-build.md`). Playwright BDD suite; CI on build · lint · format · tests.
