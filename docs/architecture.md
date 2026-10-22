# Architecture

A ten minute orientation to NoteBuilder v2 for someone who has not read the code. For the
fine grained file by file map, see Part B of [`CODE-MAP.md`](CODE-MAP.md); this page does not
repeat it.

v2 is a Svelte 5 (runes) plus TypeScript front end running inside a Tauri 2 Rust shell, backed
by SQLite. [`v2/package.json`](../v2/package.json) pins the toolchain to exact versions
(`svelte` 5.34.7, `vite` 6.3.5, `typescript` 5.8.3, `@tauri-apps/plugin-sql` 2.4.0) and takes
the remaining `@tauri-apps/*` packages on caret ranges.

## The layer split

**Components (`v2/src/App.svelte`, `v2/src/lib/components/`, `v2/src/lib/slots/*.svelte`).**
`App.svelte` is the whole authoring shell in one file: it owns the notebook value, wires the
top bar, sidebar, stage, factory, seal modal, coverage matrix and toasts, and hands work down
to the pure modules it imports. `Reader.svelte` is the sibling shell used by shared files.
Every slot type ships exactly two components, one for Edit and one for Study.

**Library core (`v2/src/lib/*.ts`).** Plain TypeScript, no Svelte, no DOM assumptions. This is
where the actual behaviour lives: the variable graph, the expression evaluator, import and
export, tags, progress, history, markdown, keyboard routing, services. Only three modules in
the whole library reach for the native shell: `db.ts`, `share.ts` and `print.ts` are the only
non-test files under `v2/src/lib/` that import `@tauri-apps/*`. Everything else runs unchanged
in a browser, in the Reader bundle, and in Node tests.

**Slot registry (`v2/src/lib/slots/registry.ts`, `v2/src/lib/slot-contract.ts`).** A slot type
is a value implementing the `SlotType` interface: a `type` string, a `kind`
(`write` / `interact` / `compute` / `track`), a `completable` flag, `create()` for default
props, `variables(props)` declaring reads and writes, optional `evaluate`, `isDone`,
`validate` and `migrate`, and the two Svelte components. `registry.ts` keeps a `Map` from type
string to slot type and registers twelve of them at module load: text, slider, compute, chart,
code, image, table, text-input, choice, list, progress, problem. Adding another means writing one
file and one `registerSlot` call, plus its entry in the published JSON Schema and the AI slot
catalog (`slot-catalog.ts`); the sync tests name whatever is missing. A hand kept icon map in
`CardView.svelte` falls back to a default glyph.
(`slots/plot.ts` is not a slot type. It is the SVG plotting helper `ChartStudy.svelte` uses.)

**Tauri shell (`v2/src-tauri/`).** `src/lib.rs` builds the Tauri app: it registers the log,
dialog, fs and sql plugins, declares the SQLite migrations, exposes one command (`print_page`,
which calls `webview.print()`), and appends Import / Export / Share items to the native File
menu with `CmdOrCtrl+O`, `CmdOrCtrl+Shift+E` and `CmdOrCtrl+Shift+P` accelerators.
`capabilities/default.json` grants the webview the `sql`, `dialog` and `fs` permissions, with
read and write of text files scoped to `$HOME/**`.

**Reader build (`v2/vite.config.reader.ts`, `v2/scripts/build-reader.mjs`).** A second, Study
only entry point, described under "Two build targets" below.

## Where data lives at runtime

All persistence is one local SQLite file, opened lazily through `tauri-plugin-sql`.
`v2/src/lib/db.ts` calls `Database.load('sqlite:notebuilder.db')` and the Rust side registers
its migrations against the same `sqlite:notebuilder.db` connection string. Tauri resolves that
relative path inside the app data directory for the bundle identifier `com.notebuilder.app`
(set in `v2/src-tauri/tauri.conf.json`), so on macOS the file is

```text
~/Library/Application Support/com.notebuilder.app/notebuilder.db
```

Five migrations, all in `v2/src-tauri/src/lib.rs`:

| # | Adds |
|---|---|
| 1 | `notebooks`, `sections`, `cards` |
| 2 | `reader_state`, `annotations` (local only, never exported) |
| 3 | `card_types` (the Factory / gallery layer, stored app wide, not per notebook) |
| 4 | `preferences` (key / value, for example the theme) |
| 5 | `data` blob columns on `notebooks` and `sections` |

The `data` columns are how optional document fields ride along without a schema change per
field: `db-map.ts` packs section extras (`kind`, `locked`, `width`, `title`, `subtitle`,
`folded`, `services`, `svcOrder`, `svcW`) into that JSON blob and unpacks them on load.

Outside Tauri there is no database at all. `isTauri()` checks for `__TAURI_INTERNALS__` on
`window`, and callers skip DB I/O when it is false, which is why `npm run dev` in a browser
loads the demo notebook and persists nothing.

Three state layers are kept deliberately apart. Document state is the notebook itself: it
persists and it exports. Reader state (quiz answers, checklist ticks, progress) lives in the
`reader_state` table keyed by card id and slot id; it persists locally and never exports. In a
shared Reader file it lives in that browser's `localStorage`, keyed by a hash of each card's
content (`reader-store.ts`), because ids are regenerated on every load.
Session state lives only in memory in `session.svelte.ts` (shuffle order, per section search,
archive toggle, and the session layer slot values) and is wiped on mode and notebook switches.
A slot picks its layer with `stateLayer` on the slot contract; `slider` is the one that opts
into `'session'`.

## The pure cores

Three modules carry the load bearing logic and are written to be dependency free so they can
be tested exhaustively and reused in every build target.

- **`variable-graph.ts`** has zero imports. `resolveGraph` topologically orders slot nodes by
  write to read dependency and evaluates each once; a cycle throws `Cycle detected: ...`.
  `findGraphIssues` is the static twin used before any evaluation, reporting reads that no
  slot in the card writes, and write to read cycles.
- **`expr.ts`** has zero imports. It is a hand written lexer, precedence climbing parser and
  tree walking evaluator for the formula language: arithmetic and comparison operators, `&&`,
  `||`, a `? :` ternary, and a fixed function and constant table (`sin`, `cos`, `tan`, `exp`,
  `log`, `sqrt`, `abs`, `sign`, `round`, `floor`, `ceil`, `min`, `max`, `pow`, `clamp`, `pi`,
  `e`). Identifier and function lookups both go through an own properties check, so no
  prototype key is reachable, and an unknown identifier resolves to `0` rather than throwing.
  There is no `eval` and no `new Function`.
- **`json-io.ts`** imports only sibling modules (`types`, `tags`, `variable-graph`, `uid`) and
  the slot registry. It performs no I/O of its own: it maps a `Notebook` to and from the
  interchange payload and validates candidate payloads. File dialogs live one layer up in
  `share.ts`.

`card-scope.ts` is the bridge: it turns a card's slots into graph nodes (writes with defaults
seed the scope, slots with `evaluate` become nodes) and calls `resolveGraph`. Because it is
only ever called with one card's slots, variables cannot cross a card boundary.

## Two build targets

**The app.** `npm run build` runs `vite.config.ts`, which builds `src/main.ts` and
`App.svelte` into `dist/`, targeting `safari16` because the Tauri webview is WebKit.
`tauri.conf.json` points `frontendDist` at `../dist` and sets `devUrl` to
`http://localhost:1420`, the port `vite.config.ts` pins with `strictPort`.

**The Reader.** `npm run build:reader` runs `scripts/build-reader.mjs`, which invokes Vite a
second time with `vite.config.reader.ts`. That config takes `reader.html` and `src/reader-main.ts`
as its entry, forces a single chunk (`inlineDynamicImports`, `cssCodeSplit: false`,
`modulePreload: false`, `assetsInlineLimit: 0`) and writes `dist-reader/`. The script then
inlines the emitted JS and CSS back into the HTML, rewrites the KaTeX font references to
`woff2` data URIs and deletes the `woff` and `ttf` alternates, asserts the payload placeholder
`<script id="notebook-source">` still exists, asserts nothing would hit the network, and
writes the result as a committed string constant in
`v2/src/lib/generated/reader-template.ts`. Regenerate and commit that file whenever the Reader
render path changes.

At share time `share.ts` calls `buildShareHtml`, which puts `{ shared, notebook, theme? }` into
that template's placeholder script (`type="application/notebuilder+json"`,
`id="notebook-source"`). On open, `reader-main.ts` reads the payload back out, validates it,
imports it and mounts `Reader.svelte`. The result is one file that needs no server, no network
and no NoteBuilder install.

For the interchange payload itself, see [`FORMAT.md`](FORMAT.md) and the JSON Schema it links.
