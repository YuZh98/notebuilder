# Interchange format

A NoteBuilder notebook travels as one JSON document. `exportNotebook` writes it and
`importNotebook` reads it, both in [`v2/src/lib/json-io.ts`](../v2/src/lib/json-io.ts), where
`SCHEMA_VERSION` is **2**. The same payload rides inside a shared Reader `.html`, wrapped as
`{ shared, notebook, theme? }` in a `<script type="application/notebuilder+json"
id="notebook-source">` tag.

## Top level

```json
{ "version": 2, "notebook": { "name": "…", "sections": [] } }
```

`notebook.name` and `notebook.sections` are required. Optional: `subtitle` (string), `width`
(`"narrow"`, `"medium"` or `"wide"`), and `cats` (string array). `cats` is the author's tag
list: it fixes tag identity and chip order regardless of which cards carry which tag.

## Section

Required: `name` (string) and `cards` (array). Optional: `kind` (only the literal `"divider"`),
`locked` (boolean), `width` (positive finite number), `title`, `subtitle`, `services` (object of
booleans, the enabled service bar features), `svcOrder` (string array, custom service order),
`svcW` (object of finite numbers, per service pixel widths).

A `"kind": "divider"` section is a chapter break holding no cards, so it carries `"cards": []`.
Validation requires `cards` on every section including dividers, but never checks emptiness.

## Card

Required: `slots` (array). Optional: `verbs` (`{ flip?, bare? }`), `back` (a second slot array,
the reverse face), `tags` (string array), `accent` (string), `w` (number), `archived` (boolean).

- `flip` gives the card two faces; `back` holds the reverse. Both faces share one variable
  scope, which is why the import time graph check spans them together.
- `bare` renders the card frameless, so it fuses into the page.
- `w` is the card's width in twelfths of the section grid. Validation rejects anything outside
  `[3, 12]`; the resize engine snaps to 0.05 of a column within that range.
- `archived` hides the card from the study grid unless the archive view is toggled on.

`Card.typeId`, the link back to the Factory card type a card was stamped from, is **not**
currently written by `exportNotebook`, so it does not survive a round trip even though it is
persisted locally in `cards.type_id`. That is a known bug, not a design decision.

## Slot

Required: `type` (a registered slot type) and `props` (an object). Optional: `verbs` (object),
`w` (number, width in twelfths), `fuse` (boolean, share a row with the next slot), `fuseW`
(positive number, this slot's share of the fused run, default 1).

Slot verbs, typed as `VerbConfig` in `types.ts` and applied in `verbs.ts`:

| Verb | Shape | Effect |
|---|---|---|
| `reveal` | `{ key, op, val }`, op one of `==` `!=` `>=` `<=` `>` `<` | Slot is hidden until the card scope satisfies the predicate. An absent key reads as false. |
| `sequential` | `true` | Slot is hidden until every prior completable slot is done. |
| `locked` | `true` | Same gate as `sequential`, but the slot is disabled rather than hidden. |
| `hint` | `{ content }` | Adds a `hint` toggle button that discloses the content. |
| `glow` | `true` | Adds the `glow` CSS class. |
| `emphasis` | `true` | Adds the `emphasis` CSS class. |

Validation checks that a slot is an object with a registry known string `type` and a positive
finite `fuseW`. It does not key check `verbs`; unknown verb keys pass through untouched.

## The eleven slot types

Registered in [`registry.ts`](../v2/src/lib/slots/registry.ts); completable slots count toward
progress meters.

| `type` | Kind | Completable | `props` |
|---|---|---|---|
| `text` | write | no | `text` (markdown plus KaTeX). `{{var}}` references become reads. |
| `slider` | interact | no | `key`, `value`, optional `min`, `max`, `step`, `showName`, `showValue`, `showSlider`. Writes `key` as a number. |
| `compute` | compute | no | `expr`, `out`, optional `note`. Reads the free identifiers in `expr`, writes `out`. |
| `chart` | compute | no | `fn`, optional `label`, `x0`, `x1`, `y0`, `y1`, `xticks`, `yticks`, `hover`. Reads the free identifiers in `fn` other than `x`. |
| `code` | write | no | `code`, optional `lang`. |
| `image` | write | no | `src` (must use a `data:`, `https:`, `http:` or `file:` scheme), optional `alt`. |
| `table` | write | no | `rows`, a string matrix; every row must have the same length. |
| `text-input` | interact | yes | optional `placeholder`, `key`. Done once the typed value is non blank. |
| `choice` | interact | yes | `options` (at least two), optional `answer` (in range indices), `multi`, `q`, `explanation`. Done once submitted. |
| `list` | write | yes | `items`, `style` (`bullets`, `numbered` or `check`). Only `check` needs ticking; other styles count as done. |
| `progress` | track | no | `scope` (`section`, `chapter` or `notebook`), optional `label`, `track`, `show` (`{ mn, pct, bar }`). |

## Import validation

`validateNotebook(json)` returns `{ errors, warnings }`: errors reject the import, warnings are
surfaced and tolerated.

**Schema version gate: only a newer file is rejected.** `version` must be a number, and a
`version` greater than 2 fails with `This file is from a newer version of the app — update the
app, then import`. A lower version is accepted and migrated.

**Shape checks.** Every optional field above is type checked when present, with the path in the
message, for example `sections[0].cards[2].w must be a number between 3 and 12`.

**Variable graph, per card, across front and back.** A write to read cycle is an **error**. A
read with no writer in the same card is a **warning**, not an error: a cross card read is a
scope smell, not corruption, so the import proceeds.

`importNotebook` adds two hard failures `validateNotebook` does not perform: it throws
`Unknown slot type: <type>` for a type absent from the registry, and runs each slot type's own
`validate(props)`, throwing `Invalid props for slot "<type>": …` on any error.

## What is not exported

`exportNotebook` writes the document layer only. All of this is left behind by design, except
the last entry.

- **Identity and ordering.** `notebook.id`, `createdAt`, `updatedAt`; `section.id`,
  `notebookId`, `position`; `card.id`, `sectionId`, `position`; `slot.id`. On import these are
  regenerated with fresh `uid` values, and positions come from array order.
- **Local view state.** `section.folded`, persisted in the local database, never exported.
- **Reader state.** Quiz answers, checklist ticks and progress live in the `reader_state`
  table, keyed by card id and slot id, so a recipient starts fresh.
- **Annotations.** Reader notes and highlights live in the `annotations` table.
- **Session state.** Shuffle order, per section search text, the archive toggle and the session
  layer slot values are in memory only and are wiped on mode and notebook switches.
- **`card.typeId`.** Dropped, as described above. This one is a bug.

## Worked example

A complete version 2 notebook: one divider, one section, one reactive card with a flip back. It
validates with zero errors and zero warnings and round trips unchanged.

```json
{
  "version": 2,
  "notebook": {
    "name": "Interest, briefly",
    "subtitle": "One reactive card",
    "width": "medium",
    "cats": ["explore"],
    "sections": [
      { "name": "Part I", "kind": "divider", "cards": [] },
      {
        "name": "Growth", "title": "Growth", "subtitle": "Drag the slider.",
        "cards": [{
          "tags": ["explore"], "accent": "#6ea8fe", "w": 12, "verbs": { "flip": true },
          "slots": [
            { "type": "slider", "props": { "key": "r", "value": 7, "min": 1, "max": 15, "step": 0.5 }, "w": 6 },
            { "type": "compute", "props": { "expr": "round(720 / r) / 10", "out": "doubling", "note": "Doubling time, years:" }, "w": 6 },
            { "type": "text", "props": { "text": "At **{{r}}%** money doubles in about **{{doubling}}** years." }, "verbs": { "reveal": { "key": "r", "op": ">=", "val": 5 } } }
          ],
          "back": [{ "type": "text", "props": { "text": "Rule of 72." } }]
        }]
      }
    ]
  }
}
```

The slider writes `r`; the compute slot reads `r` and writes `doubling`; the text slot reads
both and only appears once `r >= 5`. Longer examples live in [`docs/examples/`](examples/).

## Version and migration

Version 1 payloads had no `cats` field, so `importNotebook` derives one: `derivedTagUnion` walks
sections, then cards, then each card's `tags`, collecting them in first seen order. A version 1
notebook whose only tagged card carries `["b", "a"]` imports with `cats: ["b", "a"]`. Author
supplied `cats` always wins; the derivation runs only when the field is absent. That is the
whole version 1 to version 2 migration, and version 2 is what every export writes today.
