# ADR 0001 — Modular source bundled into one file

Status: **Accepted** (2026-06)

## Context

The prototype was a single `index.html` with ~1,900 lines in one `<script>` — deliberately no build, to
keep "own your file, open and edit." That worked early but hit a readability/maintainability ceiling:
diffs were large, layers were tangled in one closure, and review was hard.

The product's defining property is the **single-file output**: a shared explainer is one self-contained
`.html` that opens anywhere offline. That property must not change.

## Decision

Keep the **single-file artifact**, but make the **source modular** and add a tiny build step:

- Source lives in `src/` split by layer (`src/app/NN-*.js`, `src/styles.css`, `src/vendor/katex.js`).
- `scripts/build.mjs` concatenates the layers (in numeric order, after the `"use strict"` preamble and
  the vendored KaTeX) and inlines the CSS into `index.template.html`, producing `index.html`.
- The bundled `index.html` is what runs and what ships; `buildExport` inlines it further for sharing.

This is **concatenation**, not module bundling — the layers share one closure exactly as before, so the
behavior is identical (proven by the Playwright suite staying green pre- and post-split).

## Alternatives considered

- **Stay strictly single-file.** Rejected: the readability ceiling is the problem we're solving.
- **True ES modules + a bundler (esbuild/rollup).** Rejected for now: the app shares mutable globals
  (`DB`, `view`, …) across ~100 functions; rewiring every reference into imports/exports is high-risk for
  zero behavior gain. Concatenation gets modular *files* at near-zero risk. Revisit if the app grows.

## Consequences

- Edit `src/`, never `index.html` (generated). `npm run build` regenerates it.
- A build is now required to produce the runnable file. The committed `index.html` lets anyone open the
  product without building; contributors rebuild from `src/`.
- The single-file share/offline promise is fully preserved.
