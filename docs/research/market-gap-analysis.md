# NoteBuilder v2 — Market Gap Analysis

_Compiled 2026-07. Sources: two research sweeps across 20+ products — study platforms (Anki, Mochi, Quizlet, RemNote, SuperMemo, Brainscape, Brilliant, Mathigon), reactive notebooks (Observable, Jupyter, marimo, Desmos, Livebook), interactive-content authoring (H5P/Lumi, Articulate, Genially, Twine, eXeLearning, SCORM/xAPI/cmi5), local-first knowledge apps (Obsidian, Notion, Logseq, Craft, Anytype, TiddlyWiki, Heptabase, Tana), and AI-era tools (NotebookLM, Idyll/Curvenote post-mortems)._

## Our stance (held fixed for this analysis)

Per `docs/spec/v2-spec.md`: local-first macOS app, no cloud/account; core loop **Build (slots/Factory) → Study (interactive) → Share (file)**; card-scoped reactive variables; hard Edit/Study separation; LLM authors externally via JSON; not a general note app, not a collaboration tool.

## The strategic finding

The market matrix has one empty cell and it is ours: **AI-generated AND reactive AND self-contained study artifacts.**

- NotebookLM proves the demand is enormous and *artifact-shaped* (Audio Overviews doubled its base to ~10M; the whole roadmap is "more artifact types") — but its artifacts are cloud-locked, uniform, non-interactive, disposable.
- TiddlyWiki (20+ years) and Twine prove the single self-contained HTML file is a durable application platform, not just a document. SCORM's design lesson: the browser is the only runtime you can trust to exist in 20 years.
- Idyll's post-mortem explains why explorable authoring never scaled — markup was never the bottleneck; bespoke design/code per piece was (Distill: 100+ hours/article). **LLMs absorb exactly that cost.** "LLM authors the explorable, human curates it" is a structurally different bet than everything that failed — and it is our founding bet.
- Our reactivity engine (declared reads/writes → DAG → topo sort → loud cycle errors) matches the 2026 consensus that Observable, marimo, and Desmos CL converged on independently.

The stance survives contact with the market. The implementation contradicts the stance in specific places. Those contradictions are the gaps.

---

## Pillar 1 — SHARE: the artifact must outlive the app

Current: share = export JSON; the recipient must install our unsigned macOS app. This is the weakest link in the product and contradicts the spec's own "your data is yours."

| # | Gap | Evidence |
|---|-----|----------|
| G1 | **No self-contained HTML export.** One `.html`, double-click, interactive forever; runtime + data co-packaged; notebook JSON embedded in a structured, extractable block so the export is also the archive and re-importable (Twine's `<tw-storydata>` pattern, H5P's content.json). v1 already had this; v2 regressed. | Twine, TiddlyWiki, Lumi all-in-one HTML; Genially = anti-pattern (content dies with SaaS); Observable killed its own hosting — the artifact is the moat |
| G2 | **File-format spec unpublished.** Schema exists only in code. Publishing it is the credible commitment that output outlives the app, and it enables third-party players/compilers (h5p-standalone, Tweego did this for H5P/Twine). | H5P (MIT, spec public), Twine format spec under IFTF; NDLA's Flash trauma founded H5P |
| G3 | **Shared artifacts are not acquisition surfaces.** Quizlet scaled on searchable public sets; H5P launched its OER Hub. Philosophy-compatible version: exported HTML carries a "made with NoteBuilder" affordance + embedded source; ship an importable example-notebook gallery. | Quizlet 350M sets/SEO; H5P OER Hub (2026); Genially's 1,500 templates |
| G4 | **No LMS-legible wrapper.** SCORM 1.2 zip = trivial manifest + JS-API shim around the same HTML export; instantly usable in every LMS. Optional, cheap, still file-based and offline. | Lumi does exactly this; "publish SCORM 1.2 for maximum compatibility" is the 2025 rule |

## Pillar 2 — STUDY: interactive page ≠ study engine

Current: Study mode renders and tracks isDone + one progress bar. No scheduling, no sessions, no memory model, no stats.

| # | Gap | Evidence |
|---|-----|----------|
| G5 | **No review scheduler.** FSRS is free, benchmarked (~20–30% fewer reviews at equal retention), shipped by Anki, Mochi, RemNote. Algorithm quality is a commodity — SuperMemo proves 30 years of algorithmic lead is worth nothing commercially; *not having one at all* is disqualifying for the study half of our identity. | FSRS in Anki 23.10+/FSRS-6; Mochi FSRS beta; srs-benchmark |
| G6 | **No study sessions / due queue.** Study mode is a static page. Need: due-card queue, short rounds, per-card grading. Brainscape's 1–5 **confidence rating** is the right signal for us: format-agnostic, works uniformly across flashcards *and* interactive widget cards — no grading infrastructure. | Brainscape CBR; Quizlet Learn rounds |
| G7 | **No stats/motivation loop.** Review heatmap + retention + streaks are the top-cited motivation tools; Mochi's sparse stats are its most-cited weakness. | Anki Review Heatmap; Mochi criticism |
| G8 | **No exam-date scheduling.** "Set exam date → intervals compress so mastery peaks on exam day" — RemNote's one distinctive scheduler feature, cheap to add on top of G5. | RemNote exam scheduler |
| G9 | **No cloze slot.** `{{c1::…}}` is the core primitive of every flashcard leader; nested/indexed cloze with independent schedules. Fits the slot contract cleanly (completable, isDone = revealed). | Anki, Mochi, RemNote all first-class |
| — | *Non-gap:* progressive reveal. Mathigon's interaction-gated step-by-step reveal is exactly our `sequential`/`reveal`/`locked` verbs — engine already built; gap is only that built-in card types don't exploit it (see G12). | Mathigon "textbook of the future" |

## Pillar 3 — BUILD: authoring cost is what killed every predecessor

Current: form-per-slot editing, 5 built-in card types, save-card-as-type Factory, JSON import. The Distill/Idyll/Brilliant lesson: bespoke authoring is the binding constraint; Mathigon's DSL-over-component-library cut it by 10×; LLM generation collapses it further.

| # | Gap | Evidence |
|---|-----|----------|
| G10 | **No 30-second first-value path.** Quizlet delivers value in 30s with two dumb text fields; our blank card opens a form. Need: markdown-fast card entry (type text, `---` for faces, `{{var}}` live) and a paste-your-notes → LLM-prompt starter flow. Every concept a user must learn before studying *their* material is multiplicative funnel loss. | Quizlet TTFV; Mochi markdown cards; RemNote "cards fall out of notes" |
| G11 | **Slot editors are hand-written, not schema-driven.** 11 bespoke `*Edit.svelte` components. H5P's `semantics.json` auto-generates authoring forms from a parameter schema — that's why 50+ content types exist on one editor codebase, and it is the precondition for third-party slot types (the future plugin API). We already have `validate()`; we lack the declarative props schema. | H5P semantics.json; Rise's 60 block types |
| G12 | **Template/content ecosystem is 5 items deep.** Built-in card types don't showcase the engine (no progressive-reveal lesson type, no guided-derivation type); no importable example notebooks. Templates are the real onboarding ecosystem. | Genially 1,500 templates; H5P OER Hub; Twine's example culture |
| G13 | **Widget poverty vs. the composable-interactivity thesis.** Interact-with-variables inputs: slider only. Missing: Tangle-style scrubbable inline numbers in text, dropdown/toggle/radio writing variables, richer plots (multiple series, scatter, bar), simulation-loop primitive. Brilliant charges ~$300/yr for interactivity depth; Mathigon proved it's authorable cheaply when interactions are a component library — which is literally our slot architecture. The thesis is right; the library is thin. | Brilliant primitives; Observable Inputs / `mo.ui`; Bret Victor's Tangle |
| G14 | **LLM contract is a claim, not a product.** External-authoring stance is right (validated by NotebookLM's artifact demand + marimo/Observable's AI bets), but we ship: no published schema (G2), no starter prompt kit, no agent surface. 2026 baseline is a local MCP server (Notion, Craft, Anytype, Jupyter, Heptabase all shipped one): expose import/validate/export/graph-inspect so any agent authors notebooks reliably; our import-time graph validation becomes the agent's feedback loop. | Heptabase MCP (Dec 2025); Jupyter ACP/MCP agents; marimo `pair` |

## Pillar 4 — LOCAL-FIRST TRUST: mechanics behind the promise

| # | Gap | Evidence |
|---|-----|----------|
| G15 | **No version history / snapshots / undo.** "Silent last-write-wins data loss is disqualifying"; Obsidian ships file recovery + version history even without sync. Our SQLite is also opaque — acceptable *only* with a lossless documented export (G1/G2) as the exit. | Local-first table stakes; Logseq/Anytype opacity penalty |
| G16 | **No search.** Full-text with operators is non-negotiable in every researched category. We have zero. | All five local-first apps; Anki browse |
| G17 | **Known maturity debt** (tracked separately): fire-and-forget DB writes, no flush-on-quit, reader-state GC, unsigned app, no E2E tests. | — |

## Pillar 5 — SUSTAINABILITY

| # | Gap | Evidence |
|---|-----|----------|
| G18 | **No business model attached.** Mathigon: free + beautiful + no model → acquired and absorbed. Philosophy-compatible precedents: free core app forever, charge for services (Obsidian: Sync $4/Publish $8, ~$25M/yr, 10 people, no VC; Livebook: open core + Teams; Mochi: $5/mo sync+AI). Never paywall the user's own local data. Not urgent; should be *decided*, not deferred, before any public launch. | Obsidian model; Mathigon absorption; "nobody successfully sells authoring itself" |

## What the research says to REJECT (stance-confirming)

- **In-app AI generation UI** — external-LLM stance holds; NotebookLM's uniformity criticism is the counter-signal, and Anki's community explicitly distrusts generated cards. Our lane: be the best *target and renderer* for LLM output, with validation as the trust layer.
- **Cloud sync/collab as core** — every cloud-locked tool (Tana, NotebookLM, Genially) trades durability for convenience; our wedge is the other end of that spectrum. Optional paid E2E sync later = fine (Obsidian), substrate change = never (Logseq's fatal rewrite).
- **General note-taking features** (backlinks-everywhere, daily notes, graph view) — different category, different table stakes; adopting them dilutes the study-artifact identity.
- **Cross-platform sprawl now** — Logseq's mobile neglect was fatal *for a daily-capture note app*; we are a build-and-study tool where the HTML export (G1) covers consumption on every platform, which relieves (not removes) mobile pressure.

## Priority reading of the gaps

1. **Existential:** G1 (self-contained HTML export) + G5–G7 (real study engine). Without G1 the Share pillar is broken; without G5–G7 the Study pillar is a renderer, not a study tool.
2. **Identity-completing:** G14+G2 (published schema + MCP — makes the LLM story real), G13 (widget depth = the reason to exist vs. flashcard apps), G9–G10 (cloze + fast entry).
3. **Ecosystem-enabling:** G11 (schema-driven slots → plugin path), G12 (templates/examples), G3–G4 (distribution surfaces).
4. **Trust/maturity:** G15–G17.
5. **Strategic decision:** G18.
