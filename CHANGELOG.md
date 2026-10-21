# Changelog

Notable changes, following [Keep a Changelog](https://keepachangelog.com/). The notebook JSON
interchange format is versioned separately and migrated on import.

## [0.3.0] — 2026-10-21

The living handout: notebooks an LLM can draft, a teacher can trust, and a student can keep — plus a
keyboard-first Study, zoom, the Cyberpunk theme and a much larger test suite.

- **Shared files remember progress.** A shared Reader `.html` keeps each reader's answers, ticks,
  practice streaks and notes in that browser, keyed by card content so an author's later fixes
  keep everyone else's progress. "Reset my progress" starts over.
- **Results for the teacher.** "My results" in the Reader summarizes progress per section and
  graded answers; copy it or download it as JSON. Nothing leaves the device otherwise.
- **`problem` slot (12th).** Randomized numeric practice: params drawn on a step grid each attempt,
  the typed answer checked against an expression with a tolerance, "New numbers", a worked
  explanation, done after `need` correct answers. Strict answer parsing; mobile keypad friendly.
- **Guided card types.** Guided Explore (predict → explore with sliders and a chart → explain),
  Worked Example (steps with self-explanation fading into practice) and Practice Set. Existing
  installs receive new built-ins once through a preferences ledger; deleted ones stay deleted. Predictions with no answer key
  are never marked wrong.
- **Step-by-step** slot effect in the Factory: hide a slot until the earlier tasks on its card
  are done.
- **New notebook From AI.** A complete prompt for any chat AI (format, slot catalog, expression
  grammar, card-scope rule, pedagogy); paste the reply, see problems with where / what / how to
  fix and a copyable fix request, then create. Cards arrive as **drafts** to review; Share warns
  while drafts remain.
- **Published format.** JSON Schema 2020-12 (`v2/src/lib/schema/notebook.schema.json`) and
  [`docs/FORMAT.md`](docs/FORMAT.md). Rejected imports show a readable report instead of a toast.
- **Durability.** Saves are serialized and atomic (one batch per save), flushed on blur, window
  close and Cmd+Q, and never written before startup loading finishes. Fixed: edits lost when
  switching notebooks, the demo notebook overwriting a stored one at startup, interleaved saves
  failing silently, card widths snapping back to full width after a relaunch, section resets
  coming back after a restart.
- **Version history.** Automatic snapshots (at most every 10 minutes, only on change), "Save
  version now", and Restore (undoable). SQLite migration v6.
- **Shared files on phones and offline.** Under 760 px the Reader starts with its panel collapsed
  and cards go full width; the file makes no third-party request (the web-font import is
  stripped at build, and the build fails on any external reference); a damaged file shows a
  readable message instead of a blank page; the embedded payload escapes every `<`.
- **Safer sharing.** Share is refused while the notebook fails validation (the report lists
  why), so students never get a broken file; Export still writes the backup and then lists what
  would stop it re-importing. Progress keys are a hash of a per-install id and the notebook id,
  so two authors' files never share students' progress. Imported text is made well-formed
  before it reaches SQLite.
- **Examples.** `docs/examples/practice-lesson.json` (percent change) shows every new piece.
- CI runs the v2 job on Node 22 (real-SQLite tests) and fails on a stale Reader template.
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
- **Three more builtin card types** — Cheatsheet, Iron Butterfly (a payoff explorer whose
  breakevens and max profit and loss derive from three sliders), and Code Card, each with
  accent varieties.
- **Examples** — `docs/examples/grand-tour.json` exercises every slot type in one tutorial;
  `docs/examples/quant-terminal.json` rebuilds the quant-prep-terminal cockpit with chapter
  dividers, tagged flashcards, cheatsheets, a lab section, and per-section service bars.
- **Styled DMG** — the disk image opens as a proper installer window with a
  drag-to-Applications layout; `docs/install-macos.md` documents the build.
- **Simulation test tier** — seeded generative suites cover variable-graph resolution,
  interchange round-trips, progress semantics, and expression evaluation.
- **Card type binding survives export** — a card stamped from a Factory type now carries its
  `typeId` through JSON export and import, so the coverage matrix keeps its product dimension on
  a round trip. A recipient without that type reads the card as untyped.
- **Design tokens** — spacing, type, radius and motion tokens with a written governance rule;
  components consolidated onto them with zero visual change.
- **Fixed: Edit-in-Factory on typed cards** — the 🏭 action on a card stamped from a card type
  silently did nothing instead of forking the type into a Factory bench.
- **Hardened test suite** — the SQLite persistence layer, every example notebook, the Iron
  Butterfly payoff math, undo restoration of card types and Factory benches, the shortcut
  overlay, Reader authoring after Remix, and every slot component are now under test; the
  suite is 2718 tests across 204 files, plus real-SQLite tests of every migration.

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
