# NoteBuilder

**Build a reactive explainer, then share it as one offline HTML file.** Sliders drive formulas and
charts; the recipient opens a single file — no app, no account, no backend — and interacts with it
live. Local-first. Forkable.

> The wedge: most "interactive notebook" tools need a server or an app to view the result. NoteBuilder's
> output *is* a plain HTML file you can email, drop in a folder, or host anywhere. Open it, drag a
> slider, watch the math react.

---

## Quickstart

```bash
git clone <repo> && cd notebuilder
npm install
npm run dev          # builds index.html and serves at http://localhost:8950
```

Open `http://localhost:8950`. You land in **Study** on a live example card — drag the slider. Switch to
**Edit** to build, or hit **Share** to download a self-contained `.html` you can send to anyone.

No build tools needed just to *view*: the committed `index.html` is the prebuilt product — open it in
any browser, offline. The `npm` steps above are only for developing the source.

## What you can make

- **Reactive cards** — a slider, a formula, and a chart in one card wire together (variables are
  card-scoped). Drag the slider in Study and the number and curve update instantly.
- **Study material** — flashcards (flip), quizzes (auto-checked), checklists, markdown notes (with
  tables and `$math$`), and a **Progress** meter that tracks how many cards *you've* finished — per
  reader, so a shared drill fills up for whoever opens it.
- **Notebooks** organised into **sections** and foldable **chapters**.

## Authoring with an LLM

JSON import is a first-class path. In **+ New notebook → From JSON / AI**, click **Copy AI prompt**,
hand it to any LLM, paste the JSON back. The schema is small and card-scoped by design.

See [`docs/examples/`](docs/examples/) for a ready-to-load notebook — paste
[`release-notes.json`](docs/examples/release-notes.json) into the JSON / AI panel to see a finished
notebook (markdown, a reactive card, a progress meter) in seconds.

## How it's built

NoteBuilder ships as **one self-contained `index.html`** — that single-file output is the product. The
*source* is modular for maintainability and bundled at build time:

```
src/
  styles.css            app CSS
  vendor/katex.js        inlined KaTeX (math rendering, no CDN)
  app/                   the app, by layer (build order = numeric prefix)
    10-helpers   20-registries   30-state   40-services   50-render
    60-stage     70-events       80-actions 90-drag-engine …  130-boot
scripts/build.mjs        concatenates src → index.html  (committed, regenerated on build)
docs/                    CODE-MAP (architecture), ADRs, examples
tests/                   Playwright BDD suite
```

```bash
npm run build    # src/ → index.html
npm test         # build, serve, run the Playwright suite
npm run lint     # eslint
npm run format   # prettier
```

Architecture map: [`docs/CODE-MAP.md`](docs/CODE-MAP.md). Why there's a build step:
[`docs/adr/0001-modular-build.md`](docs/adr/0001-modular-build.md).

## Privacy

Everything lives in your browser's `localStorage`. A shared file carries only the notebook you exported
— never your other notebooks or your product library. The recipient's progress is theirs alone.

## License

[MIT](LICENSE).
