# v1 Feature Inventory — the UX-parity reference

_Compiled 2026-07-09 from a full audit of `src/app/*.js` + `src/styles.css`. This is the checklist
v2 parity is measured against. Vocab: house=notebook, room=section, divider=chapter, furn=card,
bench=Factory slot container, product=sealed card type. Anchors are greppable function/class/data-act
names in v1 source._

## 1. Top bar (`renderTop`, 50-render.js)

Sticky flex bar, three zones + two floating "bump" pills on `<body>`.

- **Theme menu** `thememenu`/`settheme` — 🎨 dropdown over all THEMES, current marked `.on`. Visible in every mode incl. Reader.
- **🏭 Factory** `place` — place switch, `.on` when active. Hidden in Reader.
- **Notebook switcher** `nbmenu`/`gohouse` — 📓 name ▾ dropdown over `DB.houses`. Hidden in Reader.
- **＋ New notebook** `newnb` — opens New-Notebook modal (template palette, title/subtitle, From JSON / AI textarea, ⎘ Copy AI prompt).
- **Mode toggle** (`viewToggle`) — segmented Edit/Study (house) or Build/Preview (factory), `hmode`/`facmode`.
- **Structural adds** — Edit only: `＋ section` (`addroom`), `＋ chapter` (`adddivider`); Factory Build only: `＋ container` (`addbench`).
- **History** `undo`/`redo` — ↶/↷, dimmed (opacity .4) when stack empty. Depth 60.
- **Share** `camera` → `doSnapshot()` — primary button; downloads the notebook as ONE living `.html` (see §8). NOT a screenshot/PDF despite the icon.
- **Utility group**: `⤓ export` (JSON), `⤒ import`, `🖨 pdf` (forces Study, then `window.print()` — browser dialog does the PDF).
- **Top-bar collapse** `tophide` — `#topbump` pill under the bar toggles `body.top-hidden`; persisted `lsa_tophide`.
- **Reader mode override** (`DB.shared`): left zone → theme menu + static 📓 brand; right zone → single `✎ Remix` button.

## 2. Sidebar (`renderSide`, 50-render.js)

One scrollable column, content swapped by place/mode/selection. Collapse via `#sidebump` pill
(`sidetoggle`, persisted `lsa_sidecollapsed`); width drag via `#resizer` (220–560px, persisted
`lsa_sidew`) which doubles as click-to-collapse when pointer moves <4px.

Dispatch: Factory place → `sideFactory()`; house Study → static "📖 Study" placeholder (whole sidebar
gone); else `houseEditPanel()` = `storeSection() + tagsSection() + sectionOps()` + exactly one focus
block by selection priority: product → card → house → room.

- **`storeSection`** — 🛒 collapsible lane per store; products grouped by `baseKey` with ×N badge; chips open detail and drag into rooms.
- **`tagsSection`** — 🏷 chips: draggable onto cards (`tagapply`), inline rename (`tagrename`, `pinned` reserved), delete (`tagdel`), click-to-toggle on selected card (`ftag`), add row (`addcat`).
- **`sectionOps`** — ⚙ chip per SERVICE (hidden for dividers); Flip-all disabled unless room has a flip card.
- **`productDetail`** — close, maker note, variety picker, "Your content" per-slot draft overrides (`pdraft`) driving a live preview with its own Edit/Study toggle (`prevmode`), variety chips, `＋ Place in <room>` (`placeprod`), or drag the preview card out.
- **`sideFurnInspector`** — selected placed card: variety switch (`setvariety` accent-only / `fvar` full re-sync from catalog, resets state), per-slot content editors by type (slider range/step/default/show toggles; compute formula + `varins` variable-insert buttons; chart fn/ranges/ticks/hover; list style; choice Require-check/Shuffle; progress scope/show/tag chips), Front/Back sections when flip, footer `⧉ Duplicate` / `🗑 Remove`.
- **`notebookPanel`** — width preset chips (narrow/medium/wide via `pickGroup`), delete notebook.
- **`roomContext`** — section/chapter header + delete room.
- **`sideFactory`** — four foldable tool lanes: ➕ Slots (SLOT_ORDER chips, click or drag), ▣ Card mode (Flip/Frameless, CVERBS), ✦ Slot effects (Reveal-when/Glow/Emphasis, SVERBS, applied to selected slot), 🎨 Colors (VAR palette + native color input). Below: `sideSlotConfig` for selected slot (props, Reveal-when key/op/val editor, Fuse toggle + ratio slider, delete). 📦 Inventory when nothing selected: Workshop + per-store lanes, product chips with ✕ delete, click = `loadprod` fork-to-bench.

## 3. Stage (`houseStage`/`factoryStage`/`matrixPanel`, 60-stage.js)

- **Shell**: `.card-shell.hw-{narrow|medium|wide}` max-width 680/980/1280.
- **House header**: inline-editable title/subtitle in Edit (`ceText` pattern — click swaps to auto-growing textarea, mdbar toolbar attaches on focus); static markdown in Study.
- **Chapters**: divider rooms render as `.room.divider` bar (grip, chevron `roomcollapse`, `<N sections>` badge when folded); folding skips all following rooms until next divider.
- **Sections**: drag grip, 🔒 lock toggle, inline title/subtitle, right-edge width resize (`data-roomrz`, min 240px), per-room width or responsive class.
- **Service bar** `.svcbar`: active services as widgets (Study) or drag chips (Edit); order (`svcOrder`) drag-reorderable, per-item width resizable (`svcrz`, 70–440px).
- **Card grid**: hand-rolled 12-col flex via `--w` var; filtered by archive/search/matrix; Study shuffle applies `SHUF` order.
- **Card chrome** (`.furn`): accent = `--cardc` inset 3px left stripe (the only per-card color signal); `bare` strips all chrome (dashed ghost kept in Edit); Edit-only hover controls: grip, right-edge resize (`data-rz`, 3–12 cols), 🗄 archive, 📌 pin badge.
- **Card body** (`cardInner`): per-type slot renderers; **fused slots** grouped into one row (`.fusewrap`/`.fusecell`/`.fusegut` seam, ratio `fuseW` 15–85%); **flip**: Edit = side-by-side FRONT/BACK columns; live = 3D flip stack with "↻ click to flip" hint.
- **Matrix** (`matrixPanel`): renders only when ≥2 axes have ≥2 values. Axes room/product(baseKey)/tag(+∅ untagged); independent row/col axis pickers (collision-disabled); cells = click-toggle multi-select filters with live counts (`.mtx-zero` at 0); row/col/corner select-alls; filter hides non-matching cards AND rooms; clear-filter button; foldable; header drag-reorder (rooms/tags axes) via separate drop-line mechanic (`startHeaderDrag`).
- **Factory stage**: Build = bench cards (`.benchcard`), only active bench expands (grip, inline name, ⎘/🔒 Seal/✕, maker note, Front/Back chips, slot grid with per-slot grip/resize/verb glyphs/width badge, live preview bodies, `.reveal-dim` for conditionally-hidden); Preview = read-only rendered cards with name captions.
- **Seal modal**: live preview, name, icon picker (preset + free emoji), maker note, store destination chips, variety rows (name + accent + delete, `＋ variety`), conflict footer (Cancel / Seal as new / Replace original).

## 4. Interaction systems

### Pointer drag engine (90-drag-engine.js) — ONE engine, 7 item kinds
`startCardDrag`: 5px threshold click-vs-drag; floating clone `.drag-fly` (1.5° tilt, accent border,
shadow); dashed `.drag-ph` placeholder holding layout space; **FLIP animation** (`flipGrid`) glides
neighbors on placeholder moves; `#dustbin` fixed drop-to-delete (`.hot` armed state).
Kinds → targets: card→room grids (lock/divider-guarded) + dustbin; product→room (place copy), store
lane (re-shelve), fac/bench grid (fork); bench→fac-grid reorder, seal lane, dustbin; slot→bench-grid
reorder, dustbin; room→shell reorder, dustbin (last-room guard); tag→tagbar reorder; quiz option→
option list reorder (remaps answer indices). Product-on-dustbin refuses (catalog protected).
`startHeaderDrag`: matrix axis reorder, drop-line indicator (no placeholder — CSS grid constraint).

### Edge-resize primitive (`startEdgeResize`) — 6 surfaces
Room width (240→container), card width (3–12 cols), bench slot (2–12 cols, live `w{n}` badge),
service chip (70–440px), fuse gutter (15–85%), sidebar (220–560px + click-collapse). All snapshot
undo at pointerdown → one undo step per gesture (`pushSnap`).

### Native HTML5 decorator drags (100/110 + boot)
Attach-a-decorator gestures (deliberately separate from pointer engine): service→room, svcbtn
reorder, slot-type→bench, slot-verb→bench slot, behavior chips (require-check/shuffle)→quiz card,
progress-show toggles→progress card, tag→card, container verb→faccard, color→faccard. Dustbin
accepts svc/product deletes only.

### Keyboard (120-keyboard.js)
Cmd+Enter mode toggle (place-aware) · Cmd+S no-op + "everything autosaves" toast · Cmd+Z/+Shift+Z
undo/redo (not in fields) · Esc = abort in-place edit session (restores pre-edit snapshot) / clear
matrix filter / deselect · ↑↓ room nav · ←→ card nav · Enter blurs single-line ce fields.

### Targeted refresh (70-events.js)
`refreshLive` — Study slider drags patch only affected slot cells, skip focused input, fall back to
`refreshFurn` on structural change; `refreshFurn` — one card body; `refreshPrev`/`refreshBenchPreview`
— preview panes; `searchin` re-renders stage w/ caret restore. Everything structural = full render.

## 5. Services (`SERVICES`, 40-services.js)
pin 📌 (both modes; per-card pinned tag) · shuffle 🔀 (Study; view-only SHUF order) · flipAll ⟳
(Study; needs flip card) · reset ↺ (Study; wipes progress, keeps pins/archive; undoable) · search 🔎
(Study; live per-room filter `_q`) · archive 🗄 (Study; `_showArch` reveal of `state._arch` cards).

## 6. Data/state systems

- **DB**: `{place, studyOn, stores, products, factory{benches,active,study}, houses, activeHouse, templates, theme, shared, _undo, _redo}` + derived `house`/`bench` (stripped on save, rebuilt by `rebuildRefs`).
- **History**: `commit()` = snapshot→mutate→save→render; `beginEdit()` coalesces typing into one step; `pushSnap` for gestures; depth 60; redo cleared on new action; stacks never persisted. Gap: pin/archive/flip/quiz-check bypass history.
- **Three-layer card state**: document (`_arch` — exports) / progress (answers/ticks/`_done` — local only, cleared by reset) / presentation (`_flip`,`_qord`, LIVE, SHUF — session only, stripped by `stripVol`, cleared on Study entry).
- **THEMES** (7): Dark '' · B&W 'plain' · Graphite 'mono' · Tomoé 'study' · Sketch 'sketch' · Aurora 'aurora' · Cyberpunk 'cyber'. Pure CSS: `body[data-theme]` overrides one `:root` token set (`--bg --panel --panel2 --ink --muted --line --accent --accent2 --good --warn --radius --mono --font --glow`) + per-theme decorations and webfonts (Patrick Hand, Fraunces, Chakra Petch, JetBrains/IBM Plex Mono).
- **Migrations** (SCHEMA_VERSION 4): number→slider (free-entry), check/heading→list/text folds, rollup→progress, DEAD_SLOTS pruned, fuseRatio→fuseW, id sanitization (`safeId` — XSS defense on import: ids land in `data-*` attributes unescaped), legacy `_pin`→pinned tag, shop/shops→store, core/fun→practice/live store remap.
- **Seed**: 3 stores (write/practice/live); 10 products (Flashcard w/ Blue+Mint varieties, Quiz, Note, Tracker, Mastery Dashboard, Slider Lab, Gaussian Lab, Option Payoff, Compound Growth, Quiz Card); houses "My Space" (Welcome + Reactive demo) ; template "Language Starter". `?clean` mode: separate DBKEY, single "Try me" reactive card, boots into Study.
- **Slots** (7, `SLOTS` registry): text (md+interp+KaTeX) · list (bullets/numbered/check, n/total) · choice (single-pick instant vs submit-mode Check/Try-again, shuffle, `correctSet` shared author/grader) · slider (range or free number box; `ctlClamp` finite-bounds-only; deterministic `ch` box width for offline files) · progress (completion meter, scope section/chapter/notebook, tag filter, M/N·%·bar, `cardDone`) · compute (EXPR, 4dp, optional `out` writes variable, chained fixed-point in `cardScope`) · chart (fn plot, ranges, ticks, hover line).
- **Verbs**: CVERBS flip/bare (container); SVERBS reveal `{key,op,val}` (`condOK`: == != >= <= > <) / glow / emphasis.
- **VAR palette**: 10 named accents (Default, Blue #6ea8fe, Violet, Mint, Amber, Rose, Cyan, Lime, Coral, Slate).

## 7. Varieties — two overlapping systems (see deviations)
A: `product.varieties[]` `{name,accent}` — cosmetic accent overlays, picked at placement (`pickvariety`) or after (`setvariety`). B: `--suffix` name variants — separate products grouped by `baseName` (born from `freeName` collisions), switched on placed card via `fvar` (full re-sync, resets state). Both write `card.variety`; UI can't distinguish them.

## 8. Sharing & export

- **Share (`camera` → `doSnapshot` → `buildExport`)**: one living `.html`. Inlines page CSS + entire app script (`</` escaped); KaTeX stripped when notebook has no `$`; payload = `cleanHouseExport()` (strips progress/presentation/UI state, keeps tags+`_arch`); seed ships `stores` but `products:[]`/`templates:[]` (placed cards self-contained); `shared:true` boots locked Reader (`EXPORT_MODE` = save no-op); `<` escaped `<`.
- **Reader/Remix**: locked chrome (theme + brand + Remix only); Remix flips `shared=false` in place — edits live in the open file, reload restores original; remixed file has empty catalog.
- **JSON export/import**: single active house; `importHouse` rejects newer schema, migrates older, fresh ids, undoable; `crossCardReads` warning (non-blocking) for legacy cross-card refs.
- **PDF**: `pdf` act = force Study → `window.print()`; no in-app PDF generation.

## 9. The v1 "feel" (styles.css)
`#main` CSS grid `sidebar | 5px resizer | stage`; everything else flex; hand-rolled 12ths via `--w`.
Dense control-panel spacing (4–10px gaps); chips + palettes over dropdowns; hover-reveal manipulation
chrome (grips/resizers/pin/archive at opacity 0→1); consistent accent-dashed-outline language for
drop targets/selection/editability (`.sel`, `.drop-on`, `.drag-ph`); `--radius` 14px soft cards;
elevation only on floaters (menus/modal/drag-fly/toast); per-theme personality mostly via fonts +
token swap. Buttons: `.on` (toggle active) / `.sel` (object selected) / `disabled` always with
explanatory `title`.

## 10. Known v1 defects & inconsistencies (fix, don't port)
1. Dual variety systems sharing one field (§7).
2. Undo skips pin/archive/flip/quiz-check while covering all structural ops.
3. `.glow` keyframe hardcodes default-accent rgba — wrong color under other themes.
4. `SERVICES` registry mixes runnable actions (shuffle/flipAll/reset) with feature toggles (pin/search/archive) in one shape.
5. Service bar governed by three gesture systems (click-toggle, drag-attach, native reorder + pointer resize).
6. `on` vs `sel` class split for the same "active" semantic.
7. Dustbin appears on every native dragstart even for non-deletable decorator drags.
8. Store set is a fixed enum with destructive hardcoded `core`/`fun` migration; no store CRUD UI; `store:null` products invisible outside Factory inventory.
9. Hover-only affordances = mouse-only paradigm (fine for macOS desktop; revisit if touch ever targeted).
10. Remix mutates the shared file's session in place (documented in toast; keep or fork — decide).
