# CODE-MAP — NoteBuilder source

Curated navigation map of the codebase. **Purpose: find the right spot to edit without reading the
whole thing.** Anchors below are **function/registry names** (greppable), not line numbers (those
drift).

> This repo contains **two codebases**: the shipped v1 (root) and the in-progress v2 rewrite (`v2/`).
> The v1 product is a single `index.html` — vanilla JS, `localStorage`, no framework. The v2 rewrite
> is a Svelte 5 + TypeScript + Tauri desktop app backed by SQLite.

---

## Part A: v1 (root — the shipped product)

> The app is authored as **modular source in `src/`** and bundled into a single `index.html` by
> `scripts/build.mjs` (`npm run build`). The shipped product and every shared export are one
> self-contained HTML file — vanilla JS, `localStorage`, no framework, no backend. The committed
> `index.html` is **generated**: edit `src/`, never `index.html`.

---

### A1. What v1 is (one paragraph)

A **Factory** builds *products* (cards) from **slots** (content: text/list/choice/slider/compute/
chart/progress; text renders markdown incl. `## ` headings and GFM tables; list styles
bullets/numbered/check; a slider with its bar hidden + empty range = a free number-entry box) plus
**verbs** (effects: flip · frameless · reveal/glow/emphasis). Products **seal** into an inventory and
ship to a **store**. A **Notebook** has **sections** and foldable **chapters**; you place sealed
product copies as **cards**. **Edit** = author/decorate; **Study** = read/interact, with a **Progress**
meter that tracks per-reader completion. A finished notebook **shares** as one offline `.html` that
boots straight into a locked Reader.

### A2. Source layout & dependency direction (respect this)

`src/app/*.js` are numbered fragments concatenated **in order** into one closure; each layer may use
names from the layers above it, never below. `scripts/build.mjs` injects `src/styles.css` and inlines
`src/vendor/katex.js`, then emits `index.html` from `index.template.html`.

```
00-preamble      "use strict" — must stay first
vendor/katex.js  inlined KaTeX bundle (KATEX_CSS/JS + /*KATEX_BUNDLE_START/END*/ markers)
10-helpers       esc · md/mdInline/mdBlock · uid · autoGrow · mdbar     ← pure, no state
20-registries    SLOTS · SLOT_ORDER · CVERBS · SVERBS · VAR · ctlClamp · baseKey
30-state         DB shape · DBKEY · seed · THEMES · SCHEMA_VERSION · migrateSlot/Card · LIVE/SHUF
40-services      SERVICES
50-render        render → renderTop/Side/Modal · findCard · houseEditPanel   (read-only)
60-stage         renderStage · factoryStage · mtxDims · coverage cells
70-events        refreshLive/refreshFurn — targeted re-render of one card
80-actions       placeProduct · seal* · doExport/importHouse · EXPR · buildExport (write path)
90-drag-engine   startCardDrag · startHeaderDrag · startEdgeResize
100-drag-furniture  wireDnD
110-drag-bench   wireBench
120-keyboard     shortcuts
130-boot         load → render → wire listeners
```

**The spine** (most-depended-on): `render`, `save`, `pushHistory`, `toast`, `esc`, `findCard`,
`curSlots`. **Rule:** handlers mutate `DB`, then `save()` + `render()`. Render never mutates `DB`.
State flows DB → view, never the reverse.

### A3. Data shapes (the contracts)

> **Internal vs product vocabulary** (carry this table while reading code): the codebase predates the
> product naming, so internals speak the old domain language. `house` = **notebook**, `room` =
> **section** (a `divider` room = **chapter** header), `furn`/furniture = **card**, `bench` =
> container, `store`/`shop` = **store**. Persisted keys (`DB.house`, `DB.houses`, `DBKEY`) use the
> internal names. UI strings and these docs use the product names. Renames happen opportunistically
> per layer, never big-bang.

- **`DB`** = `{ place:'house'|'factory', studyOn, products[], stores[], themes[], houses[], activeHouse,
  templates[], factory:{benches[],active,study}, _undo,_redo }`. **Derived, NOT persisted**
  (rebuilt by `rebuildRefs`, stripped by `stripVol` before `save`): `DB.house`, `DB.bench`.
- **house (notebook)** = `{ id, name, subtitle?, style(theme), width, cats[](tags), rooms[], active }`
- **room (section/chapter/divider)** = `{ id, name, kind?:'divider', cards[], services{}, state{},
  title?, subtitle?, width?, locked?, folded? }`. A `divider` row introduces a **chapter**; the cards
  after it fold/unfold under it (`folded`). Anything not a divider is a normal section.
- **card** = `{ id, name, slots[], back?, container{flip?,bare?}, rules{answer?}, accent, variety,
  icon?, place:{w}, content{}, tag[], state{} }`
- **slot** = `{ id, type, props{}, verbs:{reveal?:{key,op,val}, glow?, emphasis?} }`
- **product (catalog)** = card-ish + `{ store:storeId|null, note, icon, varieties[]:{name,accent} }`
  (one store; varieties are look-only overlays; legacy `shop`/`shops[]` migrate in `rebuildRefs`).
- **Variables are CARD-scoped** (`SCHEMA_VERSION`): a control slot (slider), compute `out`, or choice
  `key` wires only readers in the SAME card (front+back) — `progress`, `compute`, `chart`,
  `{{interp}}`, `reveal`/`condOK`. Same key in two cards = two independent variables. `cardScope(f)` =
  control defaults ▸ per-card `LIVE[f.id]` (Study drags) ▸ `f.state` (persists in undo snapshots), then
  in-card compute chains settle. JSON import warns once (`crossCardReads`) when a file's readers
  reference keys outside their card.
- **Study state has three layers** (the governing invariant — every new card/slot option must declare
  its layer): **document** (props/content/rules/tags) persists + exports; **progress** (answers/picks,
  ticks `_done`, flashcard-seen `_seen`) persists locally, never exports, cleared only by Reset — this
  is why the **Progress** slot (`cardDone`/`pgCount`, a completion meter over section/chapter/notebook)
  fills per-reader; **presentation** (`PRES_KEYS` plus `LIVE`/`SHUF`) is session-only — stripped at
  `stripVol`, cleared by `resetPresentation()` on every Study entry. Mode switches never touch progress.

### A4. Registries — single source of truth (edit here, not scattered)

| Registry | Holds | Add an entry → |
|---|---|---|
| **`SLOTS`** (7) | every slot type `{label,icon,kind,make,live,fields}` | new content/widget type |
| **`SLOT_ORDER`** | factory palette order | (also append here) |
| **`CVERBS`** (`flip`,`bare`) container MODES / **`SVERBS`** (`reveal`,`glow`,`emphasis`) slot EFFECTS | two distinct concepts, two palette lanes | new mode/effect (+ wire in `cardInner`) |
| **`mtxDims`** | coverage axes `room`/`product`/`tag` | new matrix axis |
| **`THEMES`** | app-theme registry (chips + names; only the chosen id is data) | new theme |
| **`SERVICES`** | per-room service widgets | new service |

### A5. Render call-tree (read path — `50-render.js` / `60-stage.js`)

```
render → renderTop (fixed top bar — brand · notebook▾ · ＋new · mode toggle (Edit/Study) + add
                    buttons (＋section/＋chapter, build-mode only) · history · share/export)
       → renderSide → houseEditPanel = storeSection + tagsSection + sectionOps, then one of:
                                        productDetail (selected product) · sideFurnInspector (selected
                                        card) · notebookPanel (notebook selected) · roomContext (section)
                       (factory side) → sideSlotConfig (selected slot: fields + verbs + reveal builder)
       → renderStage → houseStage → matrixPanel → [sections/chapters] → cardInner → renderSlot
                                                    → SLOTS[type].live(props, scope, rules, room, f)
                      → factoryStage → inline bench-slot previews + wireBench
       → renderModal (seal sheet: name, icon picker, ship)
```
- **`cardInner`** builds `scope = cardScope(f)` so compute/chart/reveal read the default control
  position before interaction.
- **`refreshLive(srcEl)`** (`70-events.js`) refreshes only the card containing the dragged control
  (variables can't leave the card).

### A6. The three cross-cutting engines

1. **Drag** (`90-drag-engine.js` + `100`/`110`) — ONE pointer engine `startCardDrag(src)`
   (cards/products/benches/slots/rooms; floating clone + dashed placeholder + `flipGrid` FLIP).
   `startHeaderDrag` = matrix axis reorder (deliberately separate). `startEdgeResize` backs every
   resizer. **Decorator** drags (theme/verb/tag-apply/section-op) use **native HTML5 drag** on purpose.
2. **Reactive compute** (`80-actions.js` `EXPR` + `plotSVG`) — `EXPR` (pure, no-`eval`, own-key-only
   lookups); `compute`/`chart` slots read `cardScope(f)`, `slider` writes it (`ctlClamp` clamps only
   when its range is finite — empty min/max = free entry). Scope never crosses a card boundary (§3).
3. **Coverage/matrix** (`60-stage.js`) — `mtxDims` (3 axes) + `cardMatches` (filter) + `matrixPanel`
   (grid + axis pickers) + `selCells`. Shows when ≥2 axes have ≥2 values.

Plus: **history** `pushHistory`/`undo`/`redo`/`snapState`; **persistence** `load`/`save`/`DBKEY`/
`rebuildRefs`/`stripVol`; **seed** `seed`/`freshBench`; **export** `buildExport` (`80-actions.js`)
reassembles a standalone Reader `.html` from the inlined `<style>`, the `#app` script, and the
`/*KATEX_BUNDLE_START/END*/` markers.

### A7. Event model — everything is `data-act` dispatch (listeners in `70-events.js`)

- **Producers**: render strings emit `data-act="X"` (or dynamically via `viewToggle()`/`pickGroup()`).
  A few interactions dispatch on `data-i` (`pick`, `flip`, `slide` in study).
- **Consumers**: 4 delegated listeners — **click**, **change**, **input** (each a `switch(act)`),
  **pointerdown** (drag grips), plus **drop** (native decorator drops). Most handlers: mutate `DB` →
  `save()` → `render()`.

### A8. "I want to change X" → go here (v1)

| Goal | Where |
|---|---|
| New slot/content type | `SLOTS` + `SLOT_ORDER` (`20-registries.js`; `fields` auto-generates its editor) |
| New verb/effect | `SVERBS`/`CVERBS` + apply in `cardInner` (`50-render.js`) |
| A button/action's behavior | grep its `data-act` → its `case` in the matching listener (`70-events.js`) |
| Matrix/coverage axes | `mtxDims` / `cardMatches` / `matrixPanel` (`60-stage.js`) |
| Reactive math / charts | `EXPR` / `plotSVG` / `compute`+`chart` in `SLOTS` (`80-actions.js`/`20`) |
| Chapter fold | `room.kind==='divider'` + `folded` in `houseStage` (`60-stage.js`) |
| Progress meter | `progress` slot `cardDone`/`pgCount` in `SLOTS` |
| Seed catalog / starter notebook | `seed` (`30-state.js`) |
| Persistence / migration | `rebuildRefs` · `migrateSlot`/`migrateCard` · `DBKEY` (bump = reseed) |
| Theme | `THEMES` + `body[data-theme=…]` CSS in `src/styles.css` |
| Shared-file Reader | `buildExport` (`80-actions.js`) + the `shared:true` seed branch |

### A9. Invariants & conventions (don't break — v1)

- **No `eval`/`Function`** on user content — only `EXPR` (own-key whitelist), `condOK`, `interp`.
- **Escape-first** — all user text through `esc`/`md` before innerHTML.
- **Single-file artifact** — `index.html` runs and ships as one file; `buildExport` inlines it further
  for sharing. Don't introduce a runtime that needs a server to *view* output.
- **Sealed product internals** — buyer edits content only; `expr/fn/x0/x1` (compute/chart) and slider
  `key/min/max` are excluded from the buyer's content editor.
- **Sealed card structure** — slots can't be added to or removed from a placed card; structure changes
  happen in the Factory (fork/re-place). Items/options within a slot remain editable.
- **`<\/script>` stays escaped in `buildExport`** — that string is bundled inside `<script id="app">`;
  an unescaped `</script>` substring would terminate the tag early (see the eslint-disable there).
- **DBKEY bump = fresh seed** (wipes the sandbox) — only with the user's OK.
- **`index.html` is generated** — edit `src/` and `npm run build`; never hand-edit the bundle.

### A10. Dev tooling (v1)

| Command | Does |
|---|---|
| `npm run build` | `src/` → `index.html` |
| `npm run dev` | build + serve at http://localhost:8950 |
| `npm test` | build + serve + Playwright suite (expect all green) |
| `npm run lint` | eslint over `src/app` |
| `npm run format` / `format:check` | prettier over CSS + scripts |

Manual browser checks: `window.LS.DB()`, `window.LS.reset()`, `window.render()`. The build re-emits a
fresh `index.html`, so reload after `npm run build`.

---

## Part B: v2 (`v2/` — the Tauri/Svelte rewrite)

> v2 is a full rewrite: same product concepts, new stack. It ships as a **Tauri desktop app** (Rust
> shell + Svelte 5 webview) backed by **SQLite** instead of localStorage. The codebase uses TypeScript,
> Svelte 5 runes (`$state`, `$derived`), and Vitest for unit testing.

---

### B1. What v2 is (one paragraph)

The same **Factory → product → seal → notebook** workflow rebuilt with proper types, components, and a
native desktop shell. A **Notebook** contains **Sections** (with optional `divider` kind for chapters)
holding **Cards**. Cards are stamped from **CardTypes** (the sealed product catalog). Each card has
**Slots** (typed content widgets) on front/back faces, and optional **verbs** (`flip`/`bare`). A
**service bar** per section provides study-mode features (search, shuffle, flip-all, reset, archive,
pin). Persistence is **SQLite** via Tauri's `plugin-sql`, with migrations in Rust. Import/export uses
a versioned **JSON interchange format** that validates (including variable-graph cycle detection) at
import time.

### B2. Source layout

```
v2/
  src/
    main.ts              Svelte mount
    App.svelte           Root component (~48KB): mode/place routing, notebook CRUD, effects
    app.css              Global stylesheet
    lib/
      types.ts           Core type definitions (Slot, Card, Section, Notebook — incl. Notebook.cats)
      card-types.ts      CardType, stampCard, placeType, builtinCardTypes
      bench.svelte.ts    Factory workbench state (Svelte 5 $state rune)
      seal.ts            Seal-modal draft: bench → CardType metadata capture
      session.svelte.ts  Study session state (shuffle, search, archive toggle, collapse, live values)
      notebook-ops.ts    CRUD ops: createNotebook, addSection, addChapter, duplicateCard, etc.
      tags.ts            The ONE tag write path: apply/remove/rename/delete/create/reorder + cats upkeep
      coverage-matrix.ts Matrix axes, cell matching, same 3-axis model as v1
      services.ts        ServiceBar: SERVICE_ORDER, svcBarItems, reorderSvc, search
      service-ops.ts     Mutation helpers: toggleService, resetSection, flipAllSection
      json-io.ts         Export/import (SCHEMA_VERSION 2) + validateNotebookJSON + graph validation
      html-io.ts         Shared-.html payload inject/extract (notebook-source script tag)
      share.ts           Tauri file dialog wrappers for import/export
      db.ts              SQLite layer (saveNotebook, loadNotebook, reader state, prefs)
      db-map.ts          Notebook ↔ relational row mapping
      variable-graph.ts  Topological sort, cycle detection, scope resolution
      card-scope.ts      Build scope from a card's slots (same invariant: card-scoped)
      expr.ts            Safe expression evaluator (no eval, variable whitelist)
      markdown.ts        Markdown → HTML (inline + block) with KaTeX
      mdbar.ts           Formatting toolbar actions
      verbs.ts           Reveal/glow/emphasis evaluation
      themes.ts          Theme registry
      toast.svelte.ts    Notification state
      uid.ts             ID generator
      debounce.ts        Utility
      annotations.ts     Reader annotations (local-only)
      presentation.ts    Volatile presentation keys stripped from persisted reader state
      demo.ts            First-run seed notebook
      history.svelte.ts  Undo/redo stacks: pushHistory/pushSnapshot/beginEdit (focus-coalesced)
      history-focus.ts   data-history="edit" input coalescing — one undo entry per edit session
      keyboard.ts        Pure key dispatcher: the v1 shortcut map as a decision over a KeyCtx
      study-keys.ts      Study cursor: focus order, stepping, per-key reader-state effect
      card-reveal.ts     Scroll a just-placed card into view and flash the study ring on it
      modal-inert.ts     `inert` on the shell behind a modal overlay, so Tab cannot reach it
      zoom.ts            App zoom factor (Cmd/Ctrl +/-/0) + viewport↔zoom-space conversion
      print.ts           Print: native print_page on desktop, window.print() in browser
      visible-cards.ts   The one render order: sections/cards the Stage shows (and the cursor walks)
      shell.ts           Shell/container styling logic
      slot-contract.ts   SlotType interface: create, variables, evaluate, isDone, stateLayer, render*
      progress.ts        Notebook/section/chapter progress computation
      card-done.ts       Per-card completion logic
      var-colors.ts      Variable key → color assignment
      sim-notebook.ts    Seeded notebook generator + canonical form (sim test tier)
      sim-rng.ts         Deterministic RNG + seed sweep for the sim suites
      test-utils.ts      Shared test scaffolding (pev, stubRect)

      slots/             Per-slot-type modules (11 types):
        registry.ts      Slot type registry (registerSlot / getSlot / allSlots)
        identifiers.ts   Key naming helpers
        text.ts          + TextEdit.svelte + TextStudy.svelte
        slider.ts        + SliderEdit.svelte + SliderStudy.svelte
        compute.ts       + ComputeEdit.svelte + ComputeStudy.svelte (+ .test.ts)
        chart.ts         + ChartEdit.svelte + ChartStudy.svelte + plot.ts
        choice.ts        + ChoiceEdit.svelte + ChoiceStudy.svelte (+ .test.ts)
        list.ts          + ListEdit.svelte + ListStudy.svelte (+ .test.ts)
        progress.ts      + ProgressEdit.svelte + ProgressStudy.svelte
        code.ts          + CodeEdit.svelte + CodeStudy.svelte
        image.ts         + ImageEdit.svelte + ImageStudy.svelte
        table.ts         + TableEdit.svelte + TableStudy.svelte
        text-input.ts    + TextInputEdit.svelte + TextInputStudy.svelte
        VerbWrapper.svelte   Reveal/glow/emphasis decorator

      components/        UI components:
        TopBar.svelte    Mode toggle, notebook switcher, add buttons
        Stage.svelte     Main stage router (notebook/factory/matrix)
        SectionView.svelte  Section grid: cards + chapter fold + service bar
        CardView.svelte  Card frame: front/back faces, slots, verbs, resize
        Factory.svelte   Bench editor + slot palette + preview toggle
        SideBar.svelte   Context panel: notebook · card inspector · tags · section ops · store
        CardPanel.svelte Selected-card inspector (v1 sideFurnInspector): fields, duplicate, remove, 🏭
        TagsPanel.svelte 🏷 chips: click-to-tag, drag-apply/reorder, rename, delete, create
        SideFactory.svelte  Factory sidebar (slot config, verb palette)
        CoverageMatrix.svelte  3-axis matrix grid (same v1 concept)
        ServiceBar.svelte  Per-section feature/action bar
        SealModal.svelte  Seal product: name, icon, store, varieties
        ShortcutHelp.svelte  Study shortcut overlay (toggled by ?)
        ProductDetail.svelte  Product info + fork/place
        StoreLane.svelte  Store shelf in sidebar
        SlotConfig.svelte  Slot field editor + verb builder
        CeText.svelte    ContentEditable text field
        MdBar.svelte     Markdown toolbar
        Dustbin.svelte   Drop-to-delete target
        Toast.svelte     Notifications
        CardNotes.svelte Reader annotations
        Reader.svelte    Shared-.html shell — hand-mirrors the App shell (see DEBT P1 + drift guard)

      drag/              Drag-and-drop engine:
        engine.ts        Core pointer engine (startDrag, FLIP animation)
        kinds.ts         DRAG_KINDS registry (9): card/section/qopt/product/slot/bench/tag/svc/svcattach
        geometry.ts      Hit testing, midpoint calculation
        notebook-drop.ts Drop handlers for notebook grids
        factory-drop.ts  Drop handlers for factory grids
        header-drag.ts   Matrix axis reorder (separate engine)
        svc-drop.ts      Service bar chip reorder
        resize.ts        Edge-resize engine
        qopt-remap.ts    Choice option reorder mapping
        dust.svelte.ts   Dustbin active state
        gesture-history.ts  Undo hook for drag completion

      generated/
        reader-template.ts  COMMITTED build artifact — `npm run build:reader` regenerates it
                            whenever the Reader render path changes; never hand-edit.

      stores/            Svelte stores:
        mode.ts          Edit/Study toggle
        place.ts         house/factory place
  src-tauri/
    src/lib.rs           Tauri setup: SQLite migrations (5 versions), menu events
    src/main.rs          Entry point
    Cargo.toml           tauri, plugin-sql, plugin-dialog, plugin-fs, plugin-log
    tauri.conf.json      App config
```

### B3. Data shapes (v2 — typed)

```typescript
Slot     = { id, type, props: SlotProps, verbs?: VerbConfig, w?, fuse?, fuseW? }
Card     = { id, sectionId, typeId?, position, slots[], verbs?, back?, tags?, accent?, w?, archived? }
Section  = { id, notebookId, name, position, cards[], kind?, locked?, width?, title?, subtitle?,
             folded?, services?, svcOrder?, svcW? }
Notebook = { id, name, createdAt, updatedAt, sections[], subtitle?, width?, cats? }
           // cats = author-controlled tag identity+order (D26); loaders derive it when absent
CardType.slots: SlotTemplate[] — templates carry w/fuse/fuseW so sealing keeps slot layout
CardType = { id, name, description?, verbs?, slots: SlotTemplate[], back?, accent?, note?, icon?,
             store?, varieties? }
```

**SQLite schema** (5 migrations in `lib.rs`):
- `notebooks` (id, name, created_at, updated_at, data JSON)
- `sections` (id, notebook_id FK, name, position, data JSON)
- `cards` (id, section_id FK, type_id, position, data JSON)
- `reader_state` (card_id, slot_id, data JSON) — local progress, never exported
- `annotations` (id, card_id, kind, body, created_at) — local-only
- `card_types` (id, name, data JSON, created_at) — sealed products
- `preferences` (key, value) — theme, etc.

**Same invariants as v1:**
- Variables are **card-scoped** (front + back share one scope, never cross card boundaries).
- Study state: document (exported) · progress (persisted locally, never exported) · **session**
  (`session.svelte.ts` — shuffle/search/archive-view/collapse plus `session.live`, the per-card
  control values keyed by variable name; never persisted. Entering Study wipes shuffle and live;
  search, archive view and collapse survive until the notebook changes).
- A slot declares which layer its Study writes belong to via `SlotType.stateLayer`
  (`'progress'` default → readerState by slot id; `'session'` → `session.live` by variable name —
  slider is the one session-layer slot).
- Sealed product structure is immutable; content within slots remains editable.
- The **JSON interchange** is at `SCHEMA_VERSION` **2** (v2 added `cats`); import accepts older
  versions and derives the missing fields, rejects newer.

### B4. Slot system — the `SlotType` contract

Every slot type implements `SlotType<P>` (`slot-contract.ts`):

| Method | Purpose |
|---|---|
| `create()` | Default props for a new instance |
| `variables(props)` | Declared reads/writes (feeds the variable graph) |
| `evaluate?(props, scope)` | Compute write values from current scope |
| `isDone?(props, state)` | Progress tracking (completable slots only) |
| `validate?(props)` | Prop validation errors |
| `migrate?(old, version)` | Schema migration |
| `stateLayer?` | `'progress'` (default) or `'session'` — which layer Study writes land in |
| `renderEdit` | Svelte component for Edit mode |
| `renderStudy` | Svelte component for Study mode |

**Registered types** (11): `text`, `slider`, `compute`, `chart`, `choice`, `list`, `progress`,
`code`, `image`, `table`, `text-input`.

### B5. Key systems (v2)

1. **Drag engine** (`drag/engine.ts` + `kinds.ts`) — unified pointer engine with `DRAG_KINDS` registry
   (9 kinds: card, section, qopt, product, slot, bench, tag, svc, svcattach). Same FLIP approach as
   v1. The pointer engine drives every notebook and study surface; the Factory inventory chips still
   use native HTML5 drag (`SideFactory.svelte`). A sweep test in `svc-attach.test.ts` checks that no
   component source contains the old `text/nb-svc` MIME type (WKWebView blocks custom dataTransfer
   types, which is why that native path was removed). A kind's `laneSel` makes arbitrary elements drop
   targets: tag → card applies, tag → `.tag-grid` reorders cats, svcattach → `.room` attaches /
   dustbin detaches. Separate header-drag for matrix axis reorder. Drop handlers split by context
   (notebook vs factory).

2. **Variable graph** (`variable-graph.ts`) — topological-sort evaluator. Each slot declares reads/
   writes; `resolveGraph` orders by dependency and evaluates once. `findGraphIssues` does static
   analysis (missing deps, cycles) at import time.

3. **Coverage matrix** (`coverage-matrix.ts`) — same 3 axes as v1 (section/product/tag). Appears when
   ≥2 axes have ≥2 values.

4. **Service bar** (`services.ts` + `service-ops.ts`) — 7 services (pin, shuffle, flipAll, reset,
   search, archive, notes). Features decorate cards; actions fire once. Custom order via `svcOrder`.

5. **JSON interchange** (`json-io.ts`) — versioned export/import with full validation including
   variable-graph cycle detection. Static analysis catches broken variable references before notebooks
   are loaded.

6. **Persistence** (`db.ts`) — SQLite via Tauri plugin-sql. `isTauri()` guards DB calls so the code
   runs in tests/browser without the native layer. Notebook/section/card extras ride `data` JSON
   columns (`db-map.ts`) — new optional fields need no SQL migration.

7. **Tags** (`tags.ts` + `TagsPanel.svelte`) — `Notebook.cats` holds identity and order; membership
   lives on `card.tags`. Every mutation (including the card's comma input) goes through `tags.ts`,
   which keeps `cats` in sync. `pinned` is owned by the pin button and cannot be renamed.

### B6. "I want to change X" → go here (v2)

| Goal | Where |
|---|---|
| New slot type | Implement `SlotType<P>` in `slots/mytype.ts` + Edit/Study `.svelte` + register in `slots/registry.ts` |
| New verb/effect | `verbs.ts` + wire in `slots/VerbWrapper.svelte` + update `VerbConfig` in `types.ts` |
| Card/section CRUD | `notebook-ops.ts` |
| Factory/seal workflow | `bench.svelte.ts` + `card-types.ts` + `SealModal.svelte` |
| Drag behavior | `drag/kinds.ts` (config) + `drag/notebook-drop.ts` or `drag/factory-drop.ts` (handlers) |
| Matrix/coverage axes | `coverage-matrix.ts` |
| Service bar | `services.ts` (registry/logic) + `ServiceBar.svelte` (UI) + `service-ops.ts` (mutations) |
| Import/export | `json-io.ts` (logic) + `share.ts` (file dialogs) + `html-io.ts` (shared .html) |
| Tags | `tags.ts` (all writes) + `TagsPanel.svelte` (UI) + `drag/notebook-drop.ts` `dropTag` |
| Card inspector | `CardPanel.svelte` (renders registry Edit components; writes via `updateSlotProps`) |
| Persistence/DB | `db.ts` + `db-map.ts` + migrations in `src-tauri/src/lib.rs` |
| Themes | `themes.ts` + CSS variables in `app.css` |
| Progress tracking | `progress.ts` + `card-done.ts` + `slots/progress.ts` |
| Variable reactivity | `variable-graph.ts` + `card-scope.ts` + slot's `variables()`/`evaluate()` |

### B7. Invariants & conventions (don't break — v2)

- **No `eval`/`Function`** — only `expr.ts` (whitelist-based safe evaluator).
- **Card-scoped variables** — reads/writes never cross card boundaries. `findGraphIssues` enforces.
- **SlotType contract** — every slot type must declare `variables()` and provide both render components.
- **SQLite parameterized queries** — no string interpolation of user data in SQL.
- **Session state (`session.svelte.ts`)** is never persisted or exported — entering Study wipes
  shuffle and live, and switching notebooks wipes all of it (`resetSession`).
- **`folded` is local-only** — never included in JSON export (fold state is per-reader).
- **Tauri-guard pattern** — `isTauri()` gates all native calls so lib modules run in unit tests.
- **Structural immutability of placed cards** — slot add/remove only in the Factory bench; placed cards
  allow only content and style edits (same rule as v1).
- **Components never mutate their props** — no `$bindable` in `slots/*Edit.svelte` or `*Study.svelte`
  (sweep-tested in `state-layer.test.ts`); every change flows through `onUpdate`/`onState` callbacks
  to the owner.
- **One tag write path** — all `card.tags`/`Notebook.cats` mutations go through `tags.ts`.
- **Pointer engine for notebook/study, native drag in the Factory** — `drag/engine.ts` drives every
  notebook and study gesture; the Factory inventory chips still use native HTML5 drag
  (`SideFactory.svelte`). WKWebView blocks custom dataTransfer MIME types, so that native path can't
  extend past the Factory. A sweep test in `svc-attach.test.ts` checks that no component source
  contains the old `text/nb-svc` MIME type.
- **Undo keeps live selections** — `restoreHistory` clears a selection only when the restored
  snapshot no longer contains it (D25 revised).

### B8. Dev tooling (v2)

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server (hot reload) |
| `npm run build` | Vite production build |
| `npm run tauri dev` | Tauri desktop app (Rust + webview) |
| `npm test` | Vitest run (unit tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run check` | svelte-check (type checking) |
| `npm run build:reader` | Regenerate `src/lib/generated/reader-template.ts` (commit the result) |

---

## Part C: Cross-cutting project structure

```
docs/
  CODE-MAP.md           this file
  adr/                  architecture decision records
  spec/                 v2 product spec (local, untracked)
  research/             market analysis, v1 feature inventory (local, untracked)
  examples/             example notebooks
  DEBT.md               debt ledger (local, untracked)

scripts/
  build.mjs             v1 concatenation build
  extract.mjs           v1 source extraction helper

scratch/
  p3-gate/ … p6-gate/  visual QA screenshots (v1 vs v2 side-by-side)
  HANDOFF.md            developer handoff notes

tests/                  v1 Playwright BDD suite (66 specs, 240 tests)

.github/
  workflows/ci.yml      CI: v2 check/test/build (path-filtered to v2/**)
  workflows/v1.yml      CI: v1 build/lint/test (path-filtered to root app paths)
  ISSUE_TEMPLATE/       bug/feature templates
  pull_request_template.md
```
