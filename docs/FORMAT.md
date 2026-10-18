# NoteBuilder notebook format (interchange JSON, version 2)

This is the file the v2 app writes with **⤓ Backup as JSON**, reads with **⤒ import** / **＋ → Import
file…**, and the shape any LLM must produce for **＋ → From AI…**. A shared Reader `.html` embeds the
same document (as `{"shared": true, "notebook": <this format>}` in its `<script id="notebook-source">`),
so importing a shared `.html` reads it too.

- **Machine-readable schema:** [`v2/src/lib/schema/notebook.schema.json`](../v2/src/lib/schema/notebook.schema.json)
  (JSON Schema 2020-12). Its `description` fields are written to double as documentation for people and
  for LLMs.
- **Working examples:** [`docs/examples/compound-interest.json`](examples/compound-interest.json),
  [`docs/examples/regression-drill.json`](examples/regression-drill.json),
  [`docs/examples/practice-lesson.json`](examples/practice-lesson.json) (guided cards, step-by-step
  reveals and randomized `problem` slots).
  (`release-notes.json` there is the legacy prototype format, not this one.)

## Versioning promise

- Every file carries `"version"`, an integer. The current version is **2**.
- **Older versions always import.** Each version bump ships an import migration; version 1 files (no
  `notebook.cats`) import today and get their tag categories derived from card tags, in first-seen order.
- **Newer versions are refused, clearly**: "This file is from a newer version of the app — update the
  app, then import". Nothing is half-imported.
- A change to the interchange shape bumps the version (see CONTRIBUTING.md, "Migrations always").
  Within a version, the app ignores fields it does not know, and the schema rejects them so typos and
  invented fields surface in editors and in the From AI check instead of vanishing silently.
- You may add `"$schema"` at the top level to point an editor at the schema; the app ignores it.

## What a file never contains

The file is the **document layer** only. It never carries ids (fresh ones are minted on import),
reader progress (answers, ticks, flips, a problem's drawn numbers and score), section fold state,
card notes/annotations, or live slider positions. Those belong to the reader's local state or the
session and stay on the device.

The **draft** mark is local too. A notebook made **From AI** opens with every card marked as a draft
to review; the mark is saved on this device until the author marks the card reviewed, but it is not
part of this format. Export and the shared Reader never write it, import ignores a `draft` key, and
the schema rejects one as an unknown field.

## Structure

```text
{ "version": 2, "notebook": Notebook }
Notebook  { name, subtitle?, width?, cats?, sections: Section[] }
Section   { name, cards: Card[], kind?: "divider", title?, subtitle?, locked?, width?,
            services?, svcOrder?, svcW? }
Card      { slots: Slot[], back?: Slot[], verbs?: { flip?, bare? }, tags?, accent?, w?, archived? }
Slot      { type, props, verbs?, w?, fuse?, fuseW? }
```

| Where | Field | Meaning |
| --- | --- | --- |
| notebook | `name` (required), `subtitle` | Title and one-line description. |
| notebook | `width` | `"narrow"`, `"medium"` or `"wide"` page preset. |
| notebook | `cats` | Tag categories in chip order. List every tag used in `card.tags`; unused tags are allowed. |
| section | `name` (required), `title`, `subtitle` | Sidebar name; heading and lead-in above the cards. |
| section | `kind: "divider"` | A chapter break that starts a new part. Holds no cards (`"cards": []`). |
| section | `locked` | Locks the section against editing. |
| section | `width` | Fixed width in pixels (positive). |
| section | `services`, `svcOrder`, `svcW` | Study tool bar: enabled features (`pin`, `search`, `archive`, `notes`, `shuffle`, `flipAll`, `reset` → booleans), their order, pixel widths. |
| card | `slots` (required) | The card's blocks, top to bottom (its front face when flipping). |
| card | `back`, `verbs.flip` | A flashcard: `flip: true` plus the answer side in `back`. |
| card | `verbs.bare` | Render without a card frame, as page text. |
| card | `tags` | Strings, for filtering and the coverage matrix. |
| card | `accent` | CSS color for the card frame, e.g. `"#6ea8fe"`. |
| card | `w` | Width in twelfths of the section grid, **3–12** (12 full, 6 half, 4 third). |
| card | `archived` | Hidden from the study grid unless the archive view is on. |
| slot | `type` (required), `props` (required, an object) | Which block, and its settings (see the catalog). |
| slot | `w` | Width in twelfths of the card (default 12); narrow slots wrap side by side. |
| slot | `fuse`, `fuseW` | Join with the next slot into one row cell; `fuseW` is this slot's positive share. |

### Slot verbs (`slot.verbs`)

| Verb | Shape | Effect in Study |
| --- | --- | --- |
| `reveal` | `{ "key": "a", "op": ">=", "val": 1 }`, `op` ∈ `== != >= <= > <` | Show the slot only while the condition on a card variable holds. |
| `sequential` | `true` | Hidden until every earlier completable slot in the card is done. The Factory's **Step-by-step** slot effect sets it. Give it to each step of a worked example, with a question or answer box before each, to reveal one step at a time. |
| `locked` | `true` | Shown but disabled until every earlier completable slot is done. |
| `glow`, `emphasis` | `true` | Visual emphasis. |
| `hint` | `{ "content": "..." }` | A collapsible plain-text hint. |

## Slot catalog

| `type` | Purpose | `props` |
| --- | --- | --- |
| `text` | Markdown prose with math and live values. | `text` (required). |
| `list` | Bullets, numbers, or a `check` list readers tick off. | `items: string[]`, `style: "bullets" \| "numbered" \| "check"` (both required). |
| `code` | A code block (not executed). | `code` (required), `lang`. |
| `table` | A grid of plain-text cells; first row is the header. | `rows: string[][]` (required), every row the same length. |
| `image` | An image. | `src` (required): `https:`, `http:`, `data:`, `file:` or `""` (placeholder); `alt`. |
| `choice` | A self-checking multiple-choice question. | `options: string[]` (required, ≥ 2), `q`, `answer: number[]` (0-based indexes, each < `options.length`), `multi`, `explanation` (shown after answering). |
| `slider` | A number input that **writes** the variable `key`. | `key` (required, an identifier), `value: number` (required), `min`, `max`, `step`, `showName`, `showValue`, `showSlider` (false = plain number box). |
| `text-input` | A free-text answer box; done once answered. Writes no variable. | `placeholder`, `key` (a label). |
| `compute` | A formula that **writes** the variable `out` and shows `note` + the result. | `expr` (required), `out`, `note`. |
| `chart` | A live plot of y = `fn`(x). | `fn` (required), `x0`, `x1` (set both; default 0 and x0 + 1), `y0`, `y1` (omit both to auto-fit), `xticks`, `yticks`, `hover`, `label`. |
| `progress` | A meter of finished cards. | `scope: "section" \| "chapter" \| "notebook"` (required), `label`, `track: string[]` (count only cards with these tags), `show: { mn, pct, bar }`. |
| `problem` | Practice with fresh random numbers on every attempt; the typed number is checked. | `prompt`, `params: { name, min, max, step? }[]`, `answer` (all required), `tol`, `need`, `explain`. See [Practice problems](#practice-problems-the-problem-slot). |

**Markdown and math** render only in `text.text`, `choice.q`, `choice.explanation`, `problem.prompt`
and `problem.explain`: `#`–`###`
headings, `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, `` `code` ``, `-` / `1.` lists, `>`
quotes, `|` tables, `[links](https://…)`, `$inline$` and `$$display$$` LaTeX (KaTeX), and `{{name}}`.
Every other string (options, list items, table cells, notes, labels) is plain text — use Unicode
there (x², √2, π). **In JSON, every LaTeX backslash is doubled**: `"$\\frac{a}{b}$"`. A single
backslash before `f`, `b`, `n`, `r` or `t` is a valid JSON escape, so `"\frac"` silently becomes a form
feed followed by `rac`; the From AI check warns about exactly this.

## Variables and expressions

- **Writers:** a `slider` writes `props.key`; a `compute` writes `props.out`.
- **Readers:** `compute.expr`, `chart.fn` (where `x` is the axis, not a variable), `problem.answer`,
  `{{name}}` in markdown fields (including `problem.prompt` and `problem.explain`), and
  `verbs.reveal.key`.
- **Problem params are slot-local:** a `problem`'s `params` are drawn and read inside that one slot
  only. They never become card variables, so they need no slider, and inside the slot a param
  shadows a card variable of the same name.
- **The card-scope rule: variables never cross cards.** A slot reads only variables written in its
  own card; the front and back of a flip card share one scope. A read with no writer in the card
  imports with a **warning** (it shows `?` / evaluates to 0); put the slider and everything that uses
  it in one card.
- **No cycles:** a compute may not depend, directly or through other computes, on its own `out`.
  A cycle is an import **error**.
- **Names** are identifiers (`[A-Za-z_][A-Za-z0-9_]*`), case-sensitive. Avoid the function and
  constant names below, `mod`, and `x`.
- `{{name}}` prints a value as-is; only a plain name goes inside the braces. Round in a compute:
  `round(v * 100) / 100` keeps two decimals.

Expression grammar ([`v2/src/lib/expr.ts`](../v2/src/lib/expr.ts) — a small parser, never `eval`):

| | |
| --- | --- |
| Numbers | `3`, `0.25`, `1000000` (no `1e6` exponent notation) |
| Arithmetic | `+ - * /`, `^` power (right-associative; not `**`), `%` or `mod` remainder, `//` floor division, unary `-` |
| Precedence | A leading minus binds tighter than `^`: `-x^2` is `(-x)^2`. Write `-(x^2)`, e.g. `exp(-(x^2)/2)` for a bell curve. |
| Comparison / logic | `== != < <= > >=`, `&& \|\| !`, `cond ? a : b` (comparisons yield `true` / `false`) |
| Functions | `sin cos tan` (radians), `exp`, `log` (natural), `sqrt`, `abs`, `sign`, `round` (to integer), `floor`, `ceil`, `min(a, b, …)`, `max(a, b, …)`, `pow(a, b)`, `clamp(v, lo, hi)` |
| Constants | `pi`, `e`, `true`, `false` |
| Unknowns | A misspelled variable or function silently evaluates to `0`. |

## Practice problems (the `problem` slot)

A `problem` draws fresh numbers for its `params` on every attempt, shows `prompt` with those numbers,
and checks the number the reader types against `answer`. Use it for drills and to follow a worked
example. A complete working example is the practice set in
[`docs/examples/practice-lesson.json`](examples/practice-lesson.json).

| Prop | Meaning |
| --- | --- |
| `prompt` (required) | The question: markdown, `$math$`, and `{{name}}` for a drawn param (or a card variable). |
| `params` (required) | `[{ "name": "a", "min": 2, "max": 12, "step": 1 }, …]`. Each value is drawn from `min`..`max` (`min` ≤ `max`) on the `step` grid; `step` is optional, greater than 0, default 1 (whole numbers). |
| `answer` (required) | An expression (the grammar above) over the params and the card's variables that gives the correct number. |
| `tol` | Accepted absolute error, ≥ 0. Default 0: exact up to float noise. Set it for decimal answers, e.g. `0.01` when the answer is rounded to cents. |
| `need` | Correct answers needed before the slot counts as done: a whole number ≥ 1, default 1. Use 2–3 for a drill. |
| `explain` | A worked solution shown after a correct answer or when the reader gives up: markdown, `$math$` and `{{name}}`. Always give one. |

- **Param names** follow the variable-name rule and are stricter about it: each is an identifier,
  unique within its slot, and never a built-in name (`sin` … `clamp`, `pi`, `e`, `true`, `false`,
  `mod`) or `__proto__`, `constructor`, `prototype`. A bad name is an import error.
- **Params are slot-local** (see the readers above). `answer`, `prompt` and `explain` may also read
  the card's own slider and compute variables. A read with no writer in the card is an import
  warning, and if `answer` makes it, the slot shows an error instead of grading against 0.
- **`round` takes one argument.** Scale to keep decimals: `round(x * 100) / 100`. `round(x, 2)` is an
  import error.
- When a draw makes the answer non-finite (a division by zero, say), the next draws are tried.
- Readers type one plain number: `42`, `-3.5`, `1e3` or a fraction like `-3/4`. What they type is
  never evaluated as an expression.

```json
{
  "version": 2,
  "notebook": {
    "name": "Compound interest drill",
    "sections": [
      {
        "name": "Practice",
        "cards": [
          {
            "slots": [
              { "type": "slider", "props": { "key": "r", "value": 5, "min": 1, "max": 10, "step": 1 } },
              {
                "type": "problem",
                "props": {
                  "prompt": "At **{{r}}%** a year, what does **{{P}}** grow to after **{{n}}** years? Round to cents.",
                  "params": [
                    { "name": "P", "min": 100, "max": 1000, "step": 100 },
                    { "name": "n", "min": 1, "max": 5 }
                  ],
                  "answer": "round(P * (1 + r/100)^n * 100) / 100",
                  "tol": 0.01,
                  "need": 2,
                  "explain": "Each year multiplies the amount by $1 + r/100$: {{P}} × (1 + {{r}}/100)^{{n}}, rounded to cents."
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Here `r` is a card variable (the slider writes it, and the problem reads it), while `P` and `n` are
params: drawn afresh for each attempt and invisible to the rest of the card.

## Validation on import

Import validates before it creates anything. **Errors** reject the file; **warnings** let it load.
Each finding carries a stable `code`, a document-rooted `path` (e.g.
`notebook.sections[0].cards[1].slots[2].props`) and a message, and the import report pairs it with a
fix hint (`v2/src/lib/import-hints.ts`). "Copy fix request for your AI" turns the report into a message
to paste back into the LLM that wrote the file.

Beyond the structure above, the app checks what a JSON Schema cannot express:

- each slot's own `validate()` — e.g. choice answer indexes within the options, equal-length table rows,
  a problem's param names and `answer` formula;
- formula cycles within a card (error) and cross-card reads (warning).

The From AI check additionally tolerates ```` ```json ```` fences and chatter around the object,
reports JSON syntax errors with line and column, and warns about fields the schema does not define,
about LaTeX that lost its backslash, and about formulas that use `**` or negate a power (`-x^2`).
When the only syntax problem is trailing commas, it also lists what the file would get wrong
without them, so one fix request covers everything; the notebook still cannot be created until the
commas are gone.

## Minimal example

```json
{
  "version": 2,
  "notebook": {
    "name": "Slope",
    "cats": ["explore", "check"],
    "sections": [
      {
        "name": "Lines",
        "cards": [
          {
            "tags": ["explore"],
            "slots": [
              { "type": "slider", "props": { "key": "m", "value": 1, "min": -3, "max": 3, "step": 0.5 } },
              { "type": "chart", "props": { "fn": "m * x", "x0": -5, "x1": 5, "label": "y = m x" } },
              { "type": "text", "props": { "text": "Slope $m = {{m}}$: the line rises $\\Delta y = m$ per step." } }
            ]
          },
          {
            "tags": ["check"],
            "slots": [
              {
                "type": "choice",
                "props": {
                  "q": "A line with slope $-2$…",
                  "options": ["rises to the right", "falls to the right", "is flat"],
                  "answer": [1],
                  "explanation": "A negative slope means $y$ decreases as $x$ grows."
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## Adding a slot type (contributors)

1. Schema: add the type to `$defs.slot.properties.type.enum`, add `$defs.<type>Props` (camelCase for
   hyphenated names), and add one `if`/`then` branch to `$defs.slot.allOf`.
2. Catalog: add one entry to `SLOT_CATALOG` in `v2/src/lib/slot-catalog.ts` (purpose + a valid
   example). The AI prompt picks it up from there and from the schema.
3. `schema-sync.test.ts` and `ai-prompt.test.ts` fail, naming the type, until both exist.
