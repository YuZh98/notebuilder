# NoteBuilder

**Build interactive notebooks from cards. Study them. Share them as files.**

NoteBuilder is a local-first macOS desktop app for making study material that *does something*:
flashcards that flip, quizzes that check themselves, sliders that drive formulas and charts,
checklists and progress meters that track what *you've* finished. No account, no cloud, no backend —
your notebooks live in a local SQLite database, and sharing is a file you hand to someone.

The app lives in [`v2/`](v2/) (Svelte 5 + TypeScript + Tauri 2).

## Why it's different

- **Cards are built from slots.** A card is a small stack of primitives — text, slider, formula,
  chart, choice, table, code, image, checklist, progress — arranged on a 12-column grid. A slider,
  a compute slot, and a chart in the same card wire together and react live.
- **Variables are card-scoped.** A card is a self-contained reactive unit; dependencies resolve by
  topological sort, cycles and missing writers are caught at import. Nothing leaks across cards.
- **Edit and Study are hard-separated.** Edit shows structure and configuration; Study *is* the
  rendered, interactive result. `Cmd+Enter` flips between them.
- **The Factory stamps card types.** Design a slot arrangement once, seal it as a card type, stamp
  independent copies into any notebook.
- **Sharing is a file.** Export a notebook as JSON (for another NoteBuilder), or as a
  self-contained Reader `.html` that opens in any browser, offline — the recipient reads, interacts,
  and their quiz answers and progress stay their own.

Plus the comforts: full undo/redo, drag-and-drop everything (cards, slots, tags, services), tags
with a coverage matrix, themes, GFM markdown with `$KaTeX$` math, native print.

## Run it

Prerequisites: [Node 20+](https://nodejs.org), [Rust](https://rustup.rs), and Xcode Command Line
Tools (`xcode-select --install`).

```bash
git clone https://github.com/YuZh98/notebuilder.git
cd notebuilder/v2
npm install
npm run tauri dev      # the desktop app (SQLite persistence, native print/dialogs)
```

To produce an app bundle: `npm run tauri build`.

For UI work without the native shell, `npm run dev` serves the app in a browser with a demo
notebook (persistence and native calls no-op there).

## Develop

Run inside `v2/`:

| Command | Does |
|---|---|
| `npm test` | Vitest unit suite |
| `npm run check` | svelte-check (TypeScript strict) |
| `npm run build` | Vite production build |
| `npm run build:reader` | Regenerate the embedded Reader template (commit the result) |

Orientation: [`docs/CODE-MAP.md`](docs/CODE-MAP.md) (architecture map),
[`docs/spec/v2-spec.md`](docs/spec/v2-spec.md) (product spec),
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## The original prototype

The repository root holds the first NoteBuilder: a single-file web app (vanilla JS, localStorage)
that proved the slot/card model and pioneered the one-file sharing story. It still builds and its
Playwright suite still gates CI (`npm install && npm test` at the root), but it is legacy — new
work happens in `v2/`.

## License

[MIT](LICENSE).
