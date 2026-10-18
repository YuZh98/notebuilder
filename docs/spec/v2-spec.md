# NoteBuilder v2 — Product & Architecture Spec

## What It Is

A local-first macOS desktop app for building and studying interactive notebooks. No account, no cloud, no backend. Your data is yours.

**Core loop:** Build cards from slots (Edit mode), by hand or by pasting what any LLM wrote → Study them interactively (Study mode) → Share one self-contained `.html` that opens offline in any browser and remembers each reader's progress, or a notebook JSON for another NoteBuilder.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Shell | Tauri | Native macOS, lightweight (WebKit), filesystem access, Rust backend |
| Frontend | Svelte + TypeScript | Reactive by nature, compiles away, component model maps to slot architecture |
| Bundler | Vite | Fast HMR, ES modules, Svelte integration |
| Backend | Rust (Tauri) | Filesystem, SQLite access, native menus, performance |
| Storage | SQLite | Structured queries, fast, single-file DB |
| Interchange | JSON | LLM-friendly, human-readable, validatable, versioned |
| Platform | macOS only | Single target simplifies everything |

---

## Data Model

### Hierarchy

```
Notebook → Section → Card → Slots
```

No chapters in v1. Can add later non-breakingly.

### Card Architecture

```
Slots (primitives, behavior defined in code)
  ↓ composed into
CardType (saved slot arrangement, lives in Factory/Store)
  ↓ stamped into
CardInstance (copy in a notebook, independent, no live link to type)
```

- **Slot code defines behavior.** Updating a slot improves every card using it automatically.
- **CardType defines structure.** A recipe: which slots, what arrangement, what default props.
- **CardInstance is a copy.** Once placed, it's independent. No propagation from type.

### Variable Model

- All variables are **card-scoped**. No cross-card references. This is a deliberate constraint.
- If interaction between logical units is needed, compose them as slots within one card. Cards can be arbitrarily large.
- Each slot declares its reads and writes via `variables()`:

```typescript
variables(): {
  reads: VarDeclaration[]
  writes: VarDeclaration[]
}

type VarDeclaration = {
  key: string
  type: 'number' | 'string' | 'boolean'
  default?: any
}
```

- The dependency graph is resolved via topological sort within the card (no multi-pass settling hack).
- Enables: import-time validation ("missing dependency"), cycle detection, potential wiring view (TBD, decide in use).

### State Layers

| Layer | Persists | Exports | Description |
|-------|----------|---------|-------------|
| Document | Yes | Yes | Slots, props, structure, card content |
| Reader state | Yes | No | Quiz answers, checklist ticks, isDone flags, annotations |
| Session | No | No | Current slider positions, transient UI state |

---

## Storage & Sharing

- **Internal storage:** SQLite database. Holds all notebooks, card types, factory, reader state, preferences.
  Optional notebook fields (subtitle, width, tag order) ride a JSON `data` column — no migration per field.
- **Import/Export:** JSON files. LLM-authored notebooks come in as JSON. Sharing with others = export JSON
  or a self-contained Reader `.html` (same payload embedded).
- **JSON schema:** Small, flat, validatable, versioned (currently **v2** — added `cats`, the
  author-controlled tag identity and order). Import migrates older versions and rejects newer ones.
  The contract between the app, LLMs, and other users.
- **Published format:** `v2/src/lib/schema/notebook.schema.json` (JSON Schema 2020-12) plus the
  human spec in `docs/FORMAT.md`. A sync test keeps the schema, the validator and the examples in step.
- **LLM workflow:** New notebook → From AI… builds a complete prompt (format, slot catalog,
  expression grammar, card-scope rule, pedagogy) for any chat AI → the author pastes the reply →
  the app checks it (code fences and chatter tolerated; problems listed with where / what / how to
  fix, plus a copyable fix request for the AI) → creates the notebook with every card marked
  **draft** until the author reviews it. Share warns while drafts remain. No AI runs inside the app.
- **Shared Reader:** the `.html` keeps each reader's progress in that browser's localStorage, keyed
  by card content (so an author's later fixes keep everyone else's progress), offers "My results"
  (copy or download a summary for the teacher; nothing leaves the device otherwise) and "Reset my
  progress".
- **Durability:** saves are atomic and serialized, flushed on blur, close and quit; automatic version
  snapshots (≥10 min apart, only on change) with Restore.

---

## Mode System

| Mode | Shows | Allows | Never |
|------|-------|--------|-------|
| **Edit** | Slot configuration UI — fields, structure, wiring | Change structure, props, arrangement | Live interaction behavior, rendered output |
| **Study** | Rendered interactive output | Interact (sliders, quizzes, checklists) | Structural editing, config fields |

- **Hard separation.** No preview in Edit. No editing in Study.
- **Toggle:** `Cmd+Enter` for fast switching.
- Study mode IS the preview.

---

## Slot System

### Contract

Every slot type implements:

```typescript
interface SlotType {
  type: string
  kind: 'write' | 'interact' | 'compute' | 'track'
  
  // Lifecycle
  create(): Props                              // Default props for new instance
  migrate?(old: any, version: number): Props   // Handle schema evolution
  validate?(props: Props): Error[]             // Reject invalid config
  
  // Mode-specific renderers (fully separated)
  renderEdit(slot, card): SvelteComponent
  renderStudy(slot, card, scope): SvelteComponent
  
  // Reactive model
  variables(): { reads: VarDeclaration[], writes: VarDeclaration[] }
  
  // Progress
  completable: boolean
  isDone?(slot, state): boolean
}
```

### Core Slot Catalog

| Type | Kind | Completable | Description |
|------|------|-------------|-------------|
| **text** | write | No | Markdown with `{{var}}` interpolation |
| **list** | write | When checklist | Bullets, numbered, or interactive checklist |
| **code** | write | No | Code block with syntax highlighting |
| **table** | write | No | Editable cell-based table |
| **image** | write | No | Embedded image (inline, offline-ready) |
| **choice** | interact | Yes | Quiz/multiple-choice with auto-grading |
| **slider** | interact | No | Range slider or free number input, drives reactivity |
| **text-input** | interact | Yes | Free-response field |
| **compute** | compute | No | Evaluated formula, outputs a named variable |
| **chart** | compute | No | Reactive SVG plot driven by variables |
| **progress** | track | No | Completion meter across scope |
| **problem** | interact | Yes (after `need` correct) | Randomized numeric practice: params drawn per attempt, typed answer checked against an expression |

### isDone() Unification

- Slots declare `completable: boolean`.
- Completable slots implement `isDone(slot, state): boolean`.
- **Card is done** when every completable slot in it reports `isDone() = true`.
- Cards with no completable slots are done automatically (they're content — reading is enough).
- The `sequential` and `locked` verbs consume this unified done concept.

| Slot | Done when... |
|------|-------------|
| list (checklist) | All items checked |
| choice | Answer submitted |
| text-input | Response entered |
| flip (verb) | Both sides seen |

---

## Verb System

### Card-level Verbs

| Verb | Effect |
|------|--------|
| **flip** | Two-sided card (front/back). Flipping = interaction. |
| **bare** | Frameless rendering, fuses into page |

### Slot-level Verbs

| Verb | Data | Effect |
|------|------|--------|
| **reveal** | `{key, op, val}` | Hidden until condition met |
| **glow** | `true` | Visual highlight animation |
| **emphasis** | `true` | Visual emphasis styling |
| **hint** | `{content}` | Progressive disclosure — tap to reveal help |
| **sequential** | `true` | Slot appears only when all previous completable slots are done |
| **locked** | `true` | Slot disabled until all prior completable slots are done (uses the unified isDone concept) |

---

## App Layers (UX)

```
┌─────────────────────────────────────────────┐
│  Store  (future)                            │
│  Pre-built cards, community/official        │
├─────────────────────────────────────────────┤
│  Cards Gallery  (default UX)                │
│  Ready-made card types. One click → placed. │
│  90% of users never go deeper.             │
├─────────────────────────────────────────────┤
│  Factory  (pro layer)                       │
│  Slot-level composition. Build any card     │
│  from primitives. All gallery cards are     │
│  Factory outputs.                           │
├─────────────────────────────────────────────┤
│  Slots  (primitive layer)                   │
│  The atoms. Defined in code. Never exposed  │
│  to regular users directly.                 │
└─────────────────────────────────────────────┘
```

- **Every card is a Factory product** — including built-in ones. No hard-coded special cases.
- **We dogfood the Factory** — shipping a new card type = building it in Factory via UI.
- **Recovery:** Deleting cards from a notebook doesn't lose card types. The gallery always has them.
- **Store (future):** Browsable collection of Factory-built cards.

---

## Reader Annotation Layer

- Per-card notes and highlights, owned by the reader.
- Local-only, never exported. Same lifecycle as quiz answers — private, per-reader.
- Author's document and reader's annotations are different data with different lifecycles.
- Differentiator: recipients can layer their own thinking on top of shared notebooks.

---

## Core vs Plugin Boundary

### Core (ships in app)

- All slot types listed above
- All verbs listed above
- Variable system, edit/study modes, drag/resize/reorder
- Themes
- Coverage matrix + filtering
- Reader annotation layer
- Progress/isDone system
- Import/export (JSON)
- Factory + Cards gallery

### Plugin (future, not in v1)

- Timer / pomodoro
- Advanced charts (polar, scatter, 3D)
- Spaced repetition scheduler
- Sync / backup
- Custom slot types (plugin API)
- Additional export formats (PDF, HTML, SCORM)

**Boundary rule:** If removing it makes the note broken or unrenderable → core. If removing it makes the experience less convenient but the note still works → plugin.

---

## UX Patterns to Preserve (from prototype)

These worked well and should transfer to the rebuild:

1. **Drag and resize** — cards, slots, sections are all draggable and resizable
2. **Consistent button behavior** — highlighted when enabled, predictable states
3. **Themeable** — styling cleanly decoupled from logic
4. **Coverage matrix with filtering** — structured metadata enables smart views
5. **Cmd+Enter toggle** — fast mode switching

---

## Migration Strategy

**Rewrite with scavenging.** Fresh codebase, proper module system, but port from the prototype:

| Scavenge | Don't port |
|----------|-----------|
| Drag engine | Global state / concat build |
| Resize logic | Registry-by-convention |
| Theme system | Scattered mode checks |
| Markdown renderer | localStorage persistence |
| KaTeX integration | Single-HTML-file architecture |
| EXPR evaluator | Untyped slot system |
| Chart SVG logic | |
| Edit/Study toggle UX | |

**Prototype's role:** Validated proof of concept. Reference for UX patterns and rendering logic. Not a blueprint for architecture.

---

## What's NOT This App

- Not a cloud service
- Not a collaboration tool (sharing = sending files)
- Not a general-purpose note app (it builds interactive study material)
- Not cross-platform (macOS only, for now)
- No AI/LLM features baked into the UI (LLM authoring happens externally via JSON)

---

## Open / Decide Later

- Graph visibility — whether the variable dependency graph is shown to authors as a UI element
- Spaced repetition (FSRS) and a review queue across notebooks
- A browser (PWA) build for authors on Windows / Chromebook / iPad
- LMS packaging (SCORM / LTI) for shared Readers
- An MCP server so agents can create and validate notebooks directly
- Plugin API — future, for custom slots and extensions
