# Example notebooks

Drop-in notebooks you can load to see NoteBuilder in action.

## How to load one

1. Open the app (`npm run dev`, or open `index.html` directly).
2. **+ New notebook → From JSON / AI**.
3. Paste the contents of a `.json` file here and import.

## Files

- [`release-notes.json`](release-notes.json) — a short notebook that explains NoteBuilder's wedge
  (reactive explainers shared as one offline file) using the app's own slots: text with markdown,
  a reactive card, and a progress meter. A good first look at what a finished notebook reads like.

> These are the **authoring JSON** format (`{ name, subtitle, rooms[] }`). A *shared* notebook is
> instead a standalone `.html` — open it in any browser, no import needed.
