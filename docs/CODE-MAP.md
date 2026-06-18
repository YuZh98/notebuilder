# CODE-MAP — NoteBuilder source

Curated navigation map of the codebase. **Purpose: find the right spot to edit without reading the
whole thing.** Anchors below are **function/registry names** (greppable), not line numbers (those
drift).

> The app is authored as **modular source in `src/`** and bundled into a single `index.html` by
> `scripts/build.mjs` (`npm run build`). The shipped product and every shared export are one
> self-contained HTML file — vanilla JS, `localStorage`, no framework, no backend. The committed
> `index.html` is **generated**: edit `src/`, never `index.html`.

---

## 1. What the app is (one paragraph)

A **Factory** builds *products* (cards) from **slots** (content: text/list/choice/slider/compute/
chart/progress; text renders markdown incl. `## ` headings and GFM tables; list styles
bullets/numbered/check; a slider with its bar hidden + empty range = a free number-entry box) plus
**verbs** (effects: flip · frameless · reveal/glow/emphasis). Products **seal** into an inventory and
ship to a **store**. A **Notebook** has **sections** and foldable **chapters**; you place sealed
product copies as **cards**. **Edit** = author/decorate; **Study** = read/interact, with a **Progress**
meter that tracks per-reader completion. A finished notebook **shares** as one offline `.html` that
boots straight into a locked Reader.

## 2. Source layout & dependency direction (respect this)

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

## 3. Data shapes (the contracts)

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

## 4. Registries — single source of truth (edit here, not scattered)

| Registry | Holds | Add an entry → |
|---|---|---|
| **`SLOTS`** (7) | every slot type `{label,icon,kind,make,live,fields}` | new content/widget type |
| **`SLOT_ORDER`** | factory palette order | (also append here) |
| **`CVERBS`** (`flip`,`bare`) container MODES / **`SVERBS`** (`reveal`,`glow`,`emphasis`) slot EFFECTS | two distinct concepts, two palette lanes | new mode/effect (+ wire in `cardInner`) |
| **`mtxDims`** | coverage axes `room`/`product`/`tag` | new matrix axis |
| **`THEMES`** | app-theme registry (chips + names; only the chosen id is data) | new theme |
| **`SERVICES`** | per-room service widgets | new service |

## 5. Render call-tree (read path — `50-render.js` / `60-stage.js`)

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

## 6. The three cross-cutting engines

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

## 7. Event model — everything is `data-act` dispatch (listeners in `70-events.js`)

- **Producers**: render strings emit `data-act="X"` (or dynamically via `viewToggle()`/`pickGroup()`).
  A few interactions dispatch on `data-i` (`pick`, `flip`, `slide` in study).
- **Consumers**: 4 delegated listeners — **click**, **change**, **input** (each a `switch(act)`),
  **pointerdown** (drag grips), plus **drop** (native decorator drops). Most handlers: mutate `DB` →
  `save()` → `render()`.

## 8. "I want to change X" → go here

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

## 9. Invariants & conventions (don't break)

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

## 10. Dev tooling

| Command | Does |
|---|---|
| `npm run build` | `src/` → `index.html` |
| `npm run dev` | build + serve at http://localhost:8950 |
| `npm test` | build + serve + Playwright suite (expect all green) |
| `npm run lint` | eslint over `src/app` |
| `npm run format` / `format:check` | prettier over CSS + scripts |

Manual browser checks: `window.LS.DB()`, `window.LS.reset()`, `window.render()`. The build re-emits a
fresh `index.html`, so reload after `npm run build`.
