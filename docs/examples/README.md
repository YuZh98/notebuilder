# Example notebooks

Drop-in notebooks you can import to see NoteBuilder in action.

## How to load one (v2 desktop app)

1. Run the app (`cd v2 && npm run tauri dev`, or `npm run dev` for the browser demo).
2. Click the **⤒ import** button in the top bar.
3. Pick a `.json` file from this folder.

## Files

- [`grand-tour.json`](grand-tour.json) — the tutorial notebook: every one of the eleven slot
  types, live, in one rocket mission. Sliders drive the Tsiolkovsky equation, a hidden slot
  reveals itself at escape velocity, flashcards flip, quizzes grade themselves, a checklist and
  flight log feed a notebook-wide progress meter, and the final section documents the notebook's
  own JSON from inside itself. Start here.
- [`quant-terminal.json`](quant-terminal.json) — a style rebuild of the
  [quant-prep-terminal](https://github.com/YuZh98/quant-prep-terminal) study cockpit: numbered
  chapter dividers, cheatsheet cards with rule tables, tagged flashcards, and a Lab section
  whose iron-butterfly payoff explorer derives breakevens and max profit and loss from three
  sliders. Pair it with the **Cyber DG** theme for the phosphor look.
- [`compound-interest.json`](compound-interest.json) — a reactive explainer. One card holds two
  sliders ($P$ and $r$), two computed values, prose that quotes the live numbers, and a chart of
  $A(t) = P(1 + r/100)^t$; drag a slider in Study and everything reacts. Ends with a quiz and a
  progress meter.
- [`regression-drill.json`](regression-drill.json) — study material at drill scale: flip
  flashcards with KaTeX on the back, a self-checking quiz with an explanation, a checklist, a
  notation table, chapter dividers, tags, and a notebook-wide progress meter. The coverage matrix
  in Study shows which tags each section covers.
- [`release-notes.json`](release-notes.json) — **legacy v1 format** (`{ name, rooms[] }`) for the
  prototype at the repository root; load it there via **+ New notebook → From JSON**.

> These are the **authoring JSON** format. A *shared* notebook is instead a standalone Reader
> `.html` — open it in any browser, no app needed.
