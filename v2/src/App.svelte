<script lang="ts">
  import { mode, toggleMode } from './lib/stores/mode';
  import { computeProgress, progressScopeCards, type ProgressScope } from './lib/progress';
  import TopBar from './lib/components/TopBar.svelte';
  import SideBar from './lib/components/SideBar.svelte';
  import SideFactory from './lib/components/SideFactory.svelte';
  import Stage from './lib/components/Stage.svelte';
  import Factory from './lib/components/Factory.svelte';
  import SealModal from './lib/components/SealModal.svelte';
  import FromAiModal from './lib/components/FromAiModal.svelte';
  import ImportReport from './lib/components/ImportReport.svelte';
  import type { HintedIssue } from './lib/import-hints';
  import CardView from './lib/components/CardView.svelte';
  import CoverageMatrix from './lib/components/CoverageMatrix.svelte';
  import MdBar from './lib/components/MdBar.svelte';
  import Toast from './lib/components/Toast.svelte';
  import Dustbin from './lib/components/Dustbin.svelte';
  import { toast } from './lib/toast.svelte';
  import { addAnnotation, removeAnnotation, annotationsFor, type AnnotationMap } from './lib/annotations';
  import {
    matrixDims,
    effectiveAxes,
    pruneCells,
    cardMatchesFilter,
    type MatrixAxis,
  } from './lib/coverage-matrix';
  import type { Notebook, Card, Section, SlotProps } from './lib/types';
  import {
    isTauri,
    loadNotebook,
    saveNotebook,
    deleteNotebook,
    listNotebooks,
    loadReaderState,
    saveReaderState,
    saveCardType,
    listCardTypes,
    deleteCardType,
    saveAnnotation,
    deleteAnnotation,
    loadAnnotations,
    getPreference,
    setPreference,
    onDbError,
    dbIdle,
    saveSnapshot,
    listSnapshots,
    loadSnapshot,
    type ReaderStateMap,
  } from './lib/db';
  import { createVersionKeeper } from './lib/versions';
  import { restoredNotebook, relativeTime, type SnapshotMeta } from './lib/snapshots';
  import { cardTypeChanges } from './lib/db-map';
  import { createAutosave, withTimeout, HYDRATION_FAILED_MESSAGE } from './lib/autosave';
  import { uid } from './lib/uid';
  import { stampCard, placeType, cardToType, builtinCardTypes, STORES, type CardType, type Variety } from './lib/card-types';
  import { planBuiltinSeed, BUILTIN_SEEDED_PREF } from './lib/builtin-seed';
  import type { SealOutcome } from './lib/seal';
  import { factory, addBench, typeToBench, serializeFactory, hydrateFactory, type Bench } from './lib/bench.svelte';
  import {
    registerHistory,
    clearHistory,
    pushHistory,
    captureNow,
    pushSnapshot,
    undo as histUndo,
    redo as histRedo,
    abortEdit as histAbortEdit,
    canUndo,
    canRedo,
    type HistSnapshot,
  } from './lib/history.svelte';
  import { handleAppKey, type KeyCtx } from './lib/keyboard';
  import { installEditCoalescing } from './lib/history-focus';
  import { place, setPlace } from './lib/stores/place';
  import { demoNotebook } from './lib/demo';
  import {
    createNotebook,
    addSection,
    addChapter,
    renameSection,
    deleteSection,
    moveSection,
    deleteCard,
    duplicateCard,
    findCard,
    moveCard,
    addSlot,
    deleteSlot,
    reorderSectionsByValueIndex,
  } from './lib/notebook-ops';
  import { importNotebookFromFile, exportNotebookToFile, shareNotebookToFile, shareDocId } from './lib/share';
  import { createInstallId } from './lib/install-id';
  import { importNotebook, exportNotebook, validateNotebookIssues, type NotebookJSON } from './lib/json-io';
  import { markAllDraft, clearDraft, clearAllDrafts, draftCards, nextDraft, hidingChapter } from './lib/drafts';
  import { session, shuffleSection, clearShuffle, resetSession } from './lib/session.svelte';
  import { applyTag, removeTag, renameTag, deleteTag, tagUsage, createTag, setCardTags as setCardTagsOp } from './lib/tags';
  import { stateLayerFor } from './lib/slots/registry';
  import type { Scope } from './lib/variable-graph';
  import { togglePin, setArchived, flipAllCards, resetSectionState } from './lib/service-ops';
  import { resetPresentation, stripPresentation } from './lib/presentation';
  import { SERVICE_FEATURES, SERVICE_ACTIONS, type ServiceKey } from './lib/services';
  import { startEdgeResize } from './lib/drag/resize';
  import { startPointerDrag } from './lib/drag/engine';
  import { makeNotebookDropCallbacks } from './lib/drag/notebook-drop';
  import { makeFactoryDropCallbacks } from './lib/drag/factory-drop';
  import { clampSideW, parseSideWidthPref } from './lib/shell';
  import { applyTheme, normalizeThemeId, type ThemeId } from './lib/themes';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { invoke } from '@tauri-apps/api/core';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';

  // Reader state: cardId → slotId → arbitrary state object (persisted to SQLite inside Tauri)
  let readerState: Record<string, Record<string, Record<string, unknown>>> = $state({});

  let notebook: Notebook = $state(demoNotebook());
  let notebookList: { id: string; name: string }[] = $state([
    { id: 'nb_demo', name: 'My First Notebook' },
  ]);

  let cardTypes: CardType[] = $state([...builtinCardTypes]);
  let galleryFor: string | null = $state(null);

  // ---- persistence (D0 durability) ----
  // Debounced autosave channels, gated on hydration: NOTHING persists until the startup load
  // succeeded (so the pre-hydration demo notebook / empty reader + factory state can never
  // overwrite stored data); a failed load keeps persistence off for the session and says so.
  // Outside Tauri hydration never runs, so the demo lives in memory only. Every write funnels
  // through db.ts's serialized queue, which also surfaces failures (onDbError → toast).
  const autosave = createAutosave({ wait: 600, onError: (msg) => toast(msg, 6000) });
  const notebookSave = autosave.channel('your notebook', async (nb: Notebook) => {
    const stamped = { ...nb, updatedAt: new Date().toISOString() };
    const ok = await saveNotebook(stamped);
    // Version history rides on successful saves only (hash-gated, rate-limited). The decision is
    // synchronous and the write queued, never awaited: typing never waits on a snapshot.
    if (ok) void versionKeeper.saved(stamped);
    return ok;
  });
  // Fingerprinted without volatile flip state, which is never stored: flipping alone saves nothing.
  const readerSave = autosave.channel('your study progress', (map: ReaderStateMap) => saveReaderState(map), {
    fingerprint: (map) => JSON.stringify(stripPresentation(map)),
  });
  const factorySave = autosave.channel('the Factory', (json: string) => setPreference('factory_state', json), {
    fingerprint: (json) => json,
  });

  /** May this write reach SQLite? Only inside Tauri, and only once hydration succeeded. */
  const persistOn = (): boolean => isTauri() && autosave.active;

  /**
   * This install's random id (preference 'install_id', created once, through the queued db
   * functions). A shared file saves students' progress under `${installId}:${notebook.id}`, so
   * two installs' demo notebooks (both 'nb_demo') never share it, while re-sharing one notebook
   * keeps it. Per session wherever nothing can be stored (the browser build).
   */
  const getInstallId = createInstallId({ persistOn, get: getPreference, set: setPreference });

  // ---- version history (W7): local snapshots of the open notebook ----
  // The open notebook's versions, newest first; null while there is no storage to keep them in
  // (browser demo, before hydration, failed hydration) — the panel then shows nothing.
  let versionList: SnapshotMeta[] | null = $state(null);
  const versionKeeper = createVersionKeeper({
    list: listSnapshots,
    save: saveSnapshot,
    enabled: persistOn,
    onlist: (id, list) => {
      if (id === notebook.id && persistOn()) versionList = list;
    },
  });

  /**
   * Save the CURRENT notebook, reader state and factory state now — straight from state, not
   * just whatever debounce happens to be pending (an effect may not have fired yet). Identical
   * saves are skipped. Resolves once every queued db write (card types, notes, preferences
   * too) has settled. Never rejects.
   */
  async function flushAll(): Promise<void> {
    if (!autosave.active) return;
    try {
      void notebookSave.saveNow($state.snapshot(notebook) as Notebook);
      void readerSave.saveNow($state.snapshot(readerState) as ReaderStateMap);
      void factorySave.saveNow(serializeFactory());
      await autosave.flushAll();
      await dbIdle();
    } catch (err) {
      console.error('flush failed', err);
    }
  }

  // Coverage-matrix session state (v1 view.mtxRow/mtxCol/cells/fold) — never undoable, not persisted.
  let mtxRow: MatrixAxis | null = $state(null);
  let mtxCol: MatrixAxis | null = $state(null);
  let mtxCells: string[] = $state([]);
  let mtxFold = $state(false);

  let sideW = $state(312);
  let sideCollapsed = $state(false);

  let themeId: ThemeId = $state('');

  function setTheme(id: ThemeId) {
    themeId = id;
    applyTheme(id);
    if (persistOn()) void setPreference('theme', id);
  }

  // Reader annotations: private layer on top of the document, never exported.
  let annotations: AnnotationMap = $state({});
  let notesFor: string | null = $state(null);

  function addNote(cardId: string, body: string) {
    const note = { id: uid('ann'), cardId, kind: 'note' as const, body, createdAt: new Date().toISOString() };
    annotations = addAnnotation(annotations, note);
    if (persistOn()) void saveAnnotation(note);
  }

  function deleteNote(id: string) {
    annotations = removeAnnotation(annotations, id);
    if (persistOn()) void deleteAnnotation(id);
  }

  // Effective axes (pure fallback) + matrix visibility, rebuilt from the selection.
  const matrixAxes = $derived(effectiveAxes(matrixDims(notebook, cardTypes), mtxRow, mtxCol));

  // Undo/redo availability — drives the TopBar buttons.
  const undoable = $derived(canUndo());
  const redoable = $derived(canRedo());

  // null = no filter (show everything); otherwise the set of cards matching a selected cell.
  const visibleCardIds: Set<string> | null = $derived.by(() => {
    if (mtxCells.length === 0) return null;
    const [R, C] = matrixAxes;
    const ids = new Set<string>();
    for (const section of notebook.sections) {
      for (const c of section.cards) {
        if (cardMatchesFilter(c, section.id, mtxCells, R, C, cardTypes)) ids.add(c.id);
      }
    }
    return ids;
  });

  // Drop selected cells whose row/col value no longer exists (deleted section/tag/last-of-type).
  $effect(() => {
    const [R, C] = effectiveAxes(matrixDims(notebook, cardTypes), mtxRow, mtxCol);
    const live = pruneCells(mtxCells, R, C);
    if (live.length !== mtxCells.length) mtxCells = live;
  });

  function setMatrixAxes(row: MatrixAxis | null, col: MatrixAxis | null) {
    mtxRow = row;
    mtxCol = col;
    mtxCells = [];
  }

  // Edit-mode selection (v1 sel/selKind): a section OR a card, never both; Escape clears.
  let selSection: string | null = $state(null);
  let selCard: string | null = $state(null);
  // Store detail selection (v1 selProd): a product open in the house sidebar detail panel.
  let selProd: string | null = $state(null);
  // Session-picked variety for the open product; drops stamp this (v1 90:94), else the default.
  let selVariety: Variety | null = $state(null);

  function selectSection(id: string | null) {
    selSection = id;
    selCard = null;
  }

  function selectCard(id: string) {
    selCard = id;
    selSection = null;
  }

  function confirmDialog(msg: string, title: string): Promise<boolean> {
    return isTauri() ? confirm(msg, { title, kind: 'warning' }) : Promise.resolve(window.confirm(msg));
  }

  // ---- sidebar resize / collapse (v1 gesture: drag resizes, sub-4px click toggles) ----

  function toggleSide() {
    sideCollapsed = !sideCollapsed;
    if (persistOn()) void setPreference('side_collapsed', sideCollapsed ? '1' : '0');
  }

  function startSideResize(e: PointerEvent) {
    const startX = e.clientX;
    const startW = sideW;
    let moved = false;
    startEdgeResize(
      e,
      (dx) => {
        if (Math.abs(dx) > 4) moved = true;
        if (moved && !sideCollapsed) sideW = clampSideW(startX + dx);
      },
      (mv) => {
        if (mv === null) {
          sideW = startW;
        } else if (moved && !sideCollapsed) {
          sideW = clampSideW(mv.clientX);
          if (persistOn()) void setPreference('side_width', String(sideW));
        } else {
          toggleSide();
        }
      },
    );
  }

  // ---- notebook shell ----

  /**
   * Make `nb` the open notebook (switch / new / import). The outgoing notebook is saved FIRST,
   * synchronously queued from its current state — otherwise its pending debounced save would be
   * replaced by the incoming notebook's and its last edits lost. Then list, session, selection
   * and history reset. `persisted`: storage already holds `nb` exactly (a switch) — else (new,
   * import) it is written at once instead of after the debounce.
   */
  function openNotebook(nb: Notebook, persisted: boolean) {
    // A notebook just removed (no longer listed) is not saved back; db.ts tombstones it as well.
    if (notebookList.some((e) => e.id === notebook.id)) {
      void notebookSave.saveNow($state.snapshot(notebook) as Notebook);
    }
    notebook = nb;
    notebookList = notebookList.some((e) => e.id === nb.id)
      ? notebookList.map((e) => (e.id === nb.id ? { ...e, name: nb.name } : e))
      : [{ id: nb.id, name: nb.name }, ...notebookList];
    resetSession();
    selCard = null;
    selSection = null;
    galleryFor = null;
    notesFor = null;
    mtxCells = [];
    clearHistory();
    const snap = $state.snapshot(notebook) as Notebook;
    if (persisted) notebookSave.prime(snap);
    else void notebookSave.saveNow(snap);
    // Its own versions replace the outgoing notebook's; a stored one is kept as it was opened
    // when it changed since its newest version (a new one gets its first version on that save).
    versionList = persistOn() ? [] : null;
    void versionKeeper.opened(snap, persisted);
  }

  /** Load and open a stored notebook; false when it could not be loaded. */
  async function switchNotebook(id: string): Promise<boolean> {
    if (id === notebook.id) return true;
    let nb: Notebook | null;
    try {
      nb = await loadNotebook(id);
    } catch (err) {
      toast(`Couldn’t open that notebook — ${err instanceof Error ? err.message : String(err)}`, 5000);
      return false;
    }
    if (!nb) return false;
    openNotebook(nb, true);
    return true;
  }

  function newNotebook() {
    openNotebook(createNotebook(`Notebook ${notebookList.length + 1}`), false);
  }

  // Undo/redo capture author state only (notebook + card types + factory benches); reader
  // progress, session and matrix are excluded (D2). Restore clears selection (D25).
  function captureHistory(): HistSnapshot {
    return {
      notebook: $state.snapshot(notebook) as Notebook,
      cardTypes: $state.snapshot(cardTypes) as CardType[],
      benches: $state.snapshot(factory.benches) as Bench[],
      benchActive: factory.active,
    };
  }

  function restoreHistory(s: HistSnapshot) {
    // Card types persist per write (not via autosave), so an undo/redo that swaps the list must
    // resync storage — or undoing a delete would resurrect the type in memory only.
    if (persistOn()) {
      const { upsert, remove } = cardTypeChanges($state.snapshot(cardTypes) as CardType[], s.cardTypes);
      for (const ct of upsert) void saveCardType(ct);
      for (const id of remove) void deleteCardType(id);
    }
    notebook = s.notebook;
    syncListedName();
    cardTypes = s.cardTypes;
    factory.benches = s.benches;
    factory.active = s.benchActive;
    // D25 revised (BL4): a selection the restored state still contains survives the undo;
    // only a dangling one clears — otherwise Cmd+Z slams the inspector shut mid-edit.
    if (selCard && !findCard(notebook, selCard)) selCard = null;
    if (selSection && !notebook.sections.some((x) => x.id === selSection)) selSection = null;
    if (selProd && !cardTypes.some((t) => t.id === selProd)) selProd = null;
  }

  function renameNotebook(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === notebook.name) return;
    notebook.name = trimmed;
    syncListedName();
  }

  /** The notebook menu lists the open notebook under its current name (rename, undo, restore). */
  function syncListedName() {
    const { id, name } = notebook;
    if (notebookList.some((e) => e.id === id && e.name !== name)) {
      notebookList = notebookList.map((e) => (e.id === id ? { ...e, name } : e));
    }
  }

  async function removeNotebook() {
    const ok = await confirmDialog(
      `Delete notebook "${notebook.name}"? This cannot be undone.`,
      'Delete Notebook',
    );
    if (!ok) return;
    const goneId = notebook.id;
    if (persistOn()) {
      notebookSave.cancel();
      // Its reader rows are deleted with it; drop them in memory too, so the next full-replace
      // reader-state save does not write them back.
      const goneCards = new Set(notebook.sections.flatMap((s) => s.cards.map((c) => c.id)));
      if (Object.keys(readerState).some((id) => goneCards.has(id))) {
        readerState = Object.fromEntries(Object.entries(readerState).filter(([id]) => !goneCards.has(id)));
      }
      await deleteNotebook(goneId);
      versionKeeper.forget(goneId);
    }
    notebookList = notebookList.filter((e) => e.id !== goneId);
    const next = notebookList[0];
    if (next && isTauri() && (await switchNotebook(next.id))) return;
    newNotebook();
  }

  // ---- version history: save now / restore ----

  async function saveVersionNow() {
    if (!persistOn()) return;
    // What is on screen — pending edits included — whatever the rate limit.
    if (await versionKeeper.take($state.snapshot(notebook) as Notebook, 'manual')) toast('Version saved');
  }

  /**
   * Put version `id` back: confirm → keep the current notebook as a 'before-restore' version →
   * pushHistory → replace the content under the CURRENT id (the stored card ids still match
   * reader_state) → save at once. Undo returns to what was there before.
   */
  async function restoreVersion(id: string) {
    if (!persistOn()) return;
    const nbId = notebook.id;
    const meta = versionList?.find((v) => v.id === id);
    const when = meta ? relativeTime(meta.createdAt, Date.now()) : 'earlier';
    const ok = await confirmDialog(
      `Restore the version from ${when}?\nWhat you have now is kept as a version first, and Undo brings it back.`,
      'Restore Version',
    );
    if (!ok || notebook.id !== nbId) return;
    let stored: Notebook | null;
    try {
      stored = await loadSnapshot(id);
    } catch (err) {
      toast(`Couldn’t restore that version — ${err instanceof Error ? err.message : String(err)}`, 5000);
      return;
    }
    if (notebook.id !== nbId) return; // switched notebooks while it loaded
    // Only this notebook's own versions: another's card ids would clash with that notebook's rows.
    if (!stored || stored.id !== nbId) {
      toast('That version is no longer available', 4000);
      void versionKeeper.refresh(nbId);
      return;
    }
    // The safety net is stored before anything changes; without it, nothing is restored.
    if (!(await versionKeeper.take($state.snapshot(notebook) as Notebook, 'before-restore'))) {
      toast('Couldn’t keep your current notebook as a version first — nothing was restored', 6000);
      return;
    }
    if (notebook.id !== nbId) return;
    const current = $state.snapshot(notebook) as Notebook;
    pushHistory();
    notebook = restoredNotebook(stored, current);
    syncListedName();
    if (selCard && !findCard(notebook, selCard)) selCard = null;
    if (selSection && !notebook.sections.some((x) => x.id === selSection)) selSection = null;
    void notebookSave.saveNow($state.snapshot(notebook) as Notebook);
    toast(`Restored the version from ${when} — Undo brings back what you had`, 5000);
  }

  // ---- import / export ----

  // D2: "From AI" and readable import problems. Both are modal: app shortcuts pause while open.
  // The report also lists what holds back a Share or Export (with its own title, no AI fix request).
  type ProblemReport = { errors: HintedIssue[]; warnings: HintedIssue[]; title?: string; fixRequest?: boolean };
  let fromAiOpen = $state(false);
  let importProblems: ProblemReport | null = $state.raw(null);

  function createFromAi(json: NotebookJSON) {
    let nb: Notebook;
    try {
      nb = importNotebook(json);
    } catch (e) {
      toast(`Couldn’t create the notebook — ${e instanceof Error ? e.message : String(e)}`, 5000);
      return;
    }
    // D2d: AI-written cards carry errors often enough that each one waits for the author's review.
    markAllDraft(nb);
    fromAiOpen = false;
    openNotebook(nb, false);
    toast(`Created "${nb.name}" — its cards are drafts: review each one, then Study`);
  }

  async function handleImport() {
    const result = await importNotebookFromFile();
    if ('error' in result) {
      if (result.report && (result.report.errors.length || result.report.syntax)) importProblems = result.report;
      else toast(result.error, 4000);
    } else if ('notebook' in result) {
      openNotebook(result.notebook, false);
      const n = result.warnings.length;
      if (n > 0) {
        toast(
          `Imported "${notebook.name}" — ⚠ ${n} formula${n > 1 ? 's' : ''} reference variables outside their card — variables are card-scoped; fuse those slots into one card`,
          6000,
        );
      } else {
        toast(`Imported "${notebook.name}"`);
      }
    }
  }

  /**
   * Held back by validation? The Reader validates a shared file before it shows anything, and
   * Import validates a backup — but the Study view tolerates some invalid slots (a problem
   * parameter named "e", step 0, an unfinished answer). Sharing such a notebook would give every
   * student a blank page; exporting it, a backup that can't be re-imported. Errors are listed with
   * their paths instead; warnings (a formula reading another card's variable) never block.
   */
  function heldBack(nb: Notebook, action: 'sharing' | 'exporting'): boolean {
    const { errors, warnings } = validateNotebookIssues(exportNotebook(nb));
    if (errors.length === 0) return false;
    const what = errors.length === 1 ? 'this problem' : `these ${errors.length} problems`;
    importProblems = { errors, warnings, title: `Fix ${what} before ${action}`, fixRequest: false };
    return true;
  }

  async function handleExport() {
    const nb = $state.snapshot(notebook) as Notebook;
    if (heldBack(nb, 'exporting')) return;
    const result = await exportNotebookToFile(nb);
    if ('error' in result) {
      toast(result.error, 4000);
    } else if ('path' in result) {
      toast(`Exported to ${result.path}`);
    }
  }

  async function handleShare() {
    // One snapshot: what was validated (and confirmed) is exactly what is written.
    const nb = $state.snapshot(notebook) as Notebook;
    if (heldBack(nb, 'sharing')) return;
    // D2d: AI-written cards nobody has checked should not reach students unnoticed.
    const n = draftsLeft;
    if (n > 0) {
      const ok = await confirmDialog(
        n === 1
          ? '1 card is still a draft (made by AI and not yet reviewed). Share anyway?'
          : `${n} cards are still drafts (made by AI and not yet reviewed). Share anyway?`,
        'Unreviewed Drafts',
      );
      if (!ok) return;
    }
    const result = await shareNotebookToFile(nb, themeId, shareDocId(await getInstallId(), nb.id));
    if ('error' in result) {
      toast(result.error, 4000);
    } else if ('path' in result) {
      toast('Shared — one file, opens anywhere, fully interactive');
    }
  }

  // ---- AI drafts review (D2d) ----

  const draftsLeft = $derived(draftCards(notebook).length);

  function reviewCard(card: Card) {
    if (card.draft !== true) return;
    pushHistory();
    clearDraft(card);
  }

  async function markAllReviewed() {
    const n = draftsLeft;
    if (n === 0) return;
    const id = notebook.id;
    if (n > 3 && !(await confirmDialog(`Mark all ${n} drafts as reviewed? (Undoable)`, 'Mark All Reviewed'))) return;
    if (notebook.id !== id) return; // switched notebooks while the dialog was open
    pushHistory();
    const cleared = clearAllDrafts(notebook);
    toast(`${cleared} draft${cleared === 1 ? '' : 's'} marked reviewed (Undo to restore)`);
  }

  // Where Next last landed: the queue position when it could not select (a locked card).
  let draftCursor: string | null = null;

  /** Select the next draft after the selected card (wrapping) and bring it into view. */
  async function gotoNextDraft() {
    const card = nextDraft(notebook, selCard ?? draftCursor);
    if (!card) return;
    const id = card.id;
    draftCursor = id;
    // A coverage filter or a folded chapter would hide it: show it, or Next scrolls to nothing.
    if (visibleCardIds && !visibleCardIds.has(id)) mtxCells = [];
    const chapter = hidingChapter(notebook, id);
    if (chapter) {
      pushHistory();
      delete chapter.folded;
    }
    // A locked section's card is never selected (the inspector would edit around the lock):
    // it is only brought into view, where its own chip can still mark it reviewed.
    if (sectionOfCard(id)?.locked) {
      selCard = null;
      selSection = null;
    } else {
      selectCard(id);
    }
    await tick();
    const el = [...document.querySelectorAll<HTMLElement>('#stage [data-card]')].find((e) => e.dataset.card === id);
    el?.scrollIntoView?.({ block: 'center' });
  }

  // ---- section / card / slot CRUD ----

  function setNotebookSubtitle(v: string) {
    if (v.trim()) notebook.subtitle = v;
    else delete notebook.subtitle;
  }

  // Section chrome updates arrive as patches; an undefined value deletes the key.
  function patchSection(section: Section, patch: Partial<Section>) {
    const target = section as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete target[key];
      else target[key] = value;
    }
  }

  async function removeSection(section: Section) {
    if (section.cards.length > 0) {
      const ok = await confirmDialog(
        `Delete section "${section.name}" and its ${section.cards.length} card(s)?`,
        'Delete Section',
      );
      if (!ok) return;
    }
    if (selSection === section.id) selSection = null;
    if (section.cards.some((c) => c.id === selCard)) selCard = null;
    pushHistory();
    deleteSection(notebook, section.id);
  }

  function removeCard(cardId: string) {
    if (selCard === cardId) selCard = null;
    pushHistory();
    deleteCard(notebook, cardId);
  }

  function toggleCardTag(tag: string) {
    if (!selectedCard) return;
    pushHistory();
    if (selectedCard.tags?.includes(tag)) removeTag(notebook, selectedCard.id, tag);
    else applyTag(notebook, selectedCard.id, tag);
  }

  // Snapshot-then-push so an invalid rename (pinned, empty, unchanged) costs no undo entry.
  function renameTagEverywhere(old: string, next: string) {
    const snap = captureNow();
    if (renameTag(notebook, old, next)) pushSnapshot(snap);
    else if (old === 'pinned') toast('“pinned” is maintained by the 📍 pin button and can’t be renamed');
  }

  function deleteTagEverywhere(tag: string) {
    const used = tagUsage(notebook, tag);
    void confirmDialog(
      `Delete tag “${tag}”?\nIt will be removed from ${used} card${used === 1 ? '' : 's'}. (Undoable)`,
      'Delete Tag',
    ).then((ok) => {
      if (!ok) return;
      pushHistory();
      deleteTag(notebook, tag);
      toast(`tag “${tag}” deleted (Undo to restore)`);
    });
  }

  // D26: the add input creates a free tag; click or drag the chip to put it on cards.
  function addFreeTag(name: string) {
    const snap = captureNow();
    if (createTag(notebook, name)) pushSnapshot(snap);
  }

  function gripTag(tag: string, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'tag', id: tag, srcEl }, ev, dropCallbacks);
  }

  function gripSvc(key: ServiceKey, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'svcattach', id: key, srcEl }, ev, dropCallbacks);
  }

  function duplicateSelectedCard() {
    if (!selCard) return;
    pushHistory();
    const copy = duplicateCard(notebook, selCard);
    if (copy) selCard = copy.id;
  }

  function editCardInFactory(card: Card) {
    const ct = card.typeId ? cardTypes.find((t) => t.id === card.typeId) : null;
    // structuredClone chokes on the $state proxy, so snapshot before capturing a typeless card.
    addBench(typeToBench(ct ?? cardToType($state.snapshot(card) as Card, 'Untitled')));
    setPlace('factory');
  }

  function setCardVerb(card: Card, key: 'flip' | 'bare', on: boolean) {
    pushHistory();
    const verbs = { ...card.verbs, [key]: on || undefined };
    card.verbs = verbs.flip || verbs.bare ? verbs : undefined;
    if (key === 'flip' && on && !card.back) card.back = [];
  }

  function setCardTags(card: Card, raw: string) {
    setCardTagsOp(notebook, card.id, raw);
  }

  function setCardW(card: Card, w: number) {
    card.w = w;
  }

  function setFuseW(card: Card, leftId: string, rightId: string, leftW: number, rightW: number) {
    const all = [...card.slots, ...(card.back ?? [])];
    const left = all.find((s) => s.id === leftId);
    const right = all.find((s) => s.id === rightId);
    if (!left || !right) return;
    left.fuseW = leftW;
    right.fuseW = rightW;
  }

  // ---- per-section services (bar actions, feature toggles, drag-attach) ----

  const svcLabel = (key: string): string =>
    [...SERVICE_FEATURES, ...SERVICE_ACTIONS].find((d) => d.key === key)?.label ?? key;

  const selectedSection = $derived(
    notebook.sections.find((s) => s.id === selSection && s.kind !== 'divider') ?? null,
  );

  const selectedCard = $derived(selCard ? (findCard(notebook, selCard) ?? null) : null);

  // v1 80-actions.js:2-6 runService — shuffle is view-only; flipAll/reset write reader state.
  function runService(section: Section, key: ServiceKey) {
    if (key === 'shuffle') {
      shuffleSection(section);
      toast('shuffled (view only — your order is kept)');
    } else if (key === 'flipAll') {
      readerState = flipAllCards(section, readerState);
      toast('flipped all');
    } else if (key === 'reset') {
      readerState = resetSectionState(section, readerState);
      clearShuffle(section.id);
      toast('reset — flips & answers cleared (pins and archive kept)');
    }
  }

  function setSectionService(section: Section, key: ServiceKey, on: boolean) {
    const services = { ...(section.services ?? {}) };
    if (on) services[key] = true;
    else delete services[key];
    section.services = Object.keys(services).length ? services : undefined;
  }

  // Sidebar chip click toggles the active section's feature (v1 70-events.js:67). v1 always had
  // an active room; here a selected card stands in for its section so the chip is never a silent
  // no-op — we only refuse when neither a section nor a card is selected.
  function toggleSectionService(key: ServiceKey) {
    const target = selectedSection ?? sectionOfCard(selCard);
    if (!target) {
      toast('select a section first');
      return;
    }
    pushHistory();
    setSectionService(target, key, !target.services?.[key]);
  }

  function sectionOfCard(cardId: string | null): Section | null {
    if (!cardId) return null;
    return (
      notebook.sections.find((s) => s.kind !== 'divider' && s.cards.some((c) => c.id === cardId)) ??
      null
    );
  }

  // Chip dropped on a section body (svcattach engine drag) enables the service.
  function attachSectionService(section: Section, key: ServiceKey) {
    if (section.kind === 'divider') return;
    pushHistory();
    setSectionService(section, key, true);
    toast(`added “${svcLabel(key)}” to ${section.name}`);
  }

  // Chip dropped on the dustbin disables it on the selected section (v1 130-boot.js:22).
  function detachSectionService(key: ServiceKey) {
    if (!selectedSection?.services?.[key]) return;
    pushHistory();
    setSectionService(selectedSection, key, false);
    toast(`removed “${svcLabel(key)}” from ${selectedSection.name}`);
  }

  function togglePinCard(card: Card) {
    pushHistory();
    togglePin(card);
  }

  function toggleArchiveCard(section: Section, card: Card) {
    const on = session.showArch[section.id] !== true;
    pushHistory();
    setArchived(card, on);
    toast(on ? 'archived — see the Archive view' : 'restored');
  }

  // ---- drag reorder / dust delete (Edit mode, pointer engine) ----

  const cardTypeById = (id: string) => cardTypes.find((t) => t.id === id);

  const dropCallbacks = makeNotebookDropCallbacks({
    notebook: () => notebook,
    selectedCard: () => selCard,
    selectedSection: () => selSection,
    clearSelection: () => {
      selCard = null;
      selSection = null;
    },
    confirmDelete: confirmDialog,
    attachService: (sectionId, key) => {
      const section = notebook.sections.find((s) => s.id === sectionId);
      if (section) attachSectionService(section, key as ServiceKey);
    },
    detachService: (key) => detachSectionService(key as ServiceKey),
    // Un-proxy before stamping: card-types' structuredClone throws DataCloneError on a $state proxy.
    cardType: (id) => {
      const t = cardTypeById(id);
      return t ? ($state.snapshot(t) as CardType) : undefined;
    },
    variety: (ct) => (ct.id === selProd ? selVariety : (ct.varieties?.[0] ?? null)),
  });

  // Factory-stage drops: fork/remap products, reorder or bin benches and bench slots (v1 90:71,84,89).
  const factoryDropCallbacks = makeFactoryDropCallbacks({
    // Un-proxy before forking: factory-drop's structuredClone throws DataCloneError on a $state proxy.
    cardType: (id) => {
      const t = cardTypeById(id);
      return t ? ($state.snapshot(t) as CardType) : undefined;
    },
    setStore: (ct, store) => {
      ct.store = store ?? undefined;
      if (persistOn()) void saveCardType($state.snapshot(ct) as CardType);
    },
    storeName: (store) => STORES.find((s) => s.id === store)?.name ?? store ?? 'Workshop',
    confirmDelete: confirmDialog,
  });

  function gripCard(card: Card, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'card', id: card.id, srcEl }, ev, dropCallbacks);
  }

  function gripSection(section: Section, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'section', id: section.id, srcEl }, ev, dropCallbacks);
  }

  // A store chip / product preview drags into the notebook to place; the chip never ghosts (v1 90:34).
  function gripProductHouse(id: string, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'product', id, srcEl }, ev, dropCallbacks);
  }
  function gripProductFactory(id: string, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'product', id, srcEl }, ev, factoryDropCallbacks);
  }
  function gripBench(id: string, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'bench', id, srcEl }, ev, factoryDropCallbacks);
  }
  function gripSlot(id: string, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'slot', id, srcEl }, ev, factoryDropCallbacks);
  }

  // ---- gallery / factory ----

  function toggleFacMode() {
    factory.preview = !factory.preview;
  }

  // Edit→Study seal (v1 resetPresentation): only on the transition INTO study — wipe volatile
  // flip state and section shuffle (search/showArch survive, per v1), THEN flip mode.
  function enterStudy() {
    if (get(mode) !== 'edit') return;
    readerState = resetPresentation(readerState);
    session.shuf = {};
    session.live = {};
    selCard = null;
    selSection = null;
    selProd = null;
    toggleMode();
  }

  let sealBenchId: string | null = $state(null);
  const sealBench = $derived(
    sealBenchId ? (factory.benches.find((b) => b.id === sealBenchId) ?? null) : null,
  );
  const sealExisting = $derived.by(() => {
    const src = sealBench?.src;
    return src ? (cardTypes.find((t) => t.id === src.id) ?? null) : null;
  });
  const sealTaken = $derived(
    cardTypes.filter((t) => t.id !== sealExisting?.id).map((t) => t.name),
  );

  function handleSeal(benchId: string) {
    const b = factory.benches.find((x) => x.id === benchId);
    if (!b) return;
    if (!b.slots.length) {
      toast('add a slot first');
      return;
    }
    sealBenchId = benchId;
  }

  function confirmSeal(o: SealOutcome) {
    pushHistory();
    const b = sealBench;
    if (b) {
      // Mirror the sealed metadata back onto the bench (v1 sealConfirm 80-actions:29,31).
      b.name = o.type.name;
      if (o.type.note) b.note = o.type.note;
      else delete b.note;
      if (o.type.icon) b.icon = o.type.icon;
      else delete b.icon;
    }
    if (o.kind === 'replace') {
      cardTypes = cardTypes.map((t) => (t.id === o.type.id ? o.type : t));
    } else {
      cardTypes = [...cardTypes, o.type];
      if (b) b.src = null;
    }
    if (persistOn()) void saveCardType(o.type);
    sealBenchId = null;
    toast(`sealed "${o.type.name}"`);
  }

  function isBuiltinType(id: string): boolean {
    return builtinCardTypes.some((b) => b.id === id);
  }

  function stampFromGallery(sectionId: string, ct: CardType) {
    const section = notebook.sections.find((s) => s.id === sectionId);
    if (!section || section.kind === 'divider') return;
    pushHistory();
    section.cards.push(stampCard($state.snapshot(ct) as CardType, sectionId, section.cards.length));
    galleryFor = null;
  }

  // ---- house store: product detail + placement (v1 selprod / placeProduct) ----

  function pickProduct(id: string) {
    selProd = id;
    selVariety = cardTypeById(id)?.varieties?.[0] ?? null;
  }

  function placeProduct(variety: Variety | null, draft: Record<string, SlotProps>) {
    const ct = cardTypes.find((t) => t.id === selProd);
    if (!ct) return;
    const target =
      notebook.sections.find((s) => s.id === selSection && s.kind !== 'divider') ??
      notebook.sections.find((s) => s.kind !== 'divider');
    if (!target) {
      toast('add a section first');
      return;
    }
    pushHistory();
    // Overlay the draft onto a pure copy of the type's slot templates (by index) before stamping.
    const snap = $state.snapshot(ct) as CardType;
    const drafted: CardType = {
      ...snap,
      slots: snap.slots.map((t, i) =>
        draft[String(i)] ? { ...t, props: { ...t.props, ...draft[String(i)] } } : t,
      ),
    };
    target.cards.push(placeType(drafted, target.id, target.cards.length, variety ?? undefined));
    toast(`placed "${ct.name}"`);
  }

  function saveCardAsType(card: Card, name: string) {
    const ct = cardToType($state.snapshot(card) as Card, name);
    cardTypes = [...cardTypes, ct];
    if (persistOn()) void saveCardType(ct);
    toast(`Saved card type "${name}"`);
  }

  async function removeCardType(ct: CardType) {
    const ok = await confirmDialog(`Delete card type "${ct.name}"?`, 'Delete Card Type');
    if (!ok) return;
    pushHistory();
    cardTypes = cardTypes.filter((t) => t.id !== ct.id);
    if (persistOn()) void deleteCardType(ct.id);
  }

  // Cmd+Enter to toggle mode; on launch, hydrate from SQLite when running as the app.
  onMount(() => {
    const unlisteners: Array<() => void> = [];
    registerHistory({ capture: captureHistory, restore: restoreHistory });
    unlisteners.push(installEditCoalescing());
    delete document.documentElement.dataset.theme;
    if (isTauri()) {
      onDbError((msg) => toast(msg, 6000));
      unlisteners.push(() => onDbError(null));
      // The notebook exactly as storage holds it — what its version history compares against.
      let storedNotebook: Notebook | null = null;
      // Persistence turns on only when this whole load succeeded (autosave.hydrate).
      void autosave.hydrate(async () => {
        const savedTheme = await getPreference('theme');
        themeId = normalizeThemeId(savedTheme);
        applyTheme(themeId);
        const [savedW, savedCollapsed, savedFactory] = await Promise.all([
          getPreference('side_width'),
          getPreference('side_collapsed'),
          getPreference('factory_state'),
        ]);
        const w = parseSideWidthPref(savedW);
        if (w !== null) sideW = w;
        sideCollapsed = savedCollapsed === '1';
        hydrateFactory(savedFactory);
        // Each channel is primed with exactly what storage holds, the moment it is known — NOT
        // with the in-memory value at the end of the load, which may already include an edit
        // made while the rest of the load was still running (that edit would never be saved).
        const rows = await listNotebooks();
        if (rows.length === 0) {
          const first = $state.snapshot(notebook) as Notebook;
          if (!(await saveNotebook(first))) throw new Error('could not create the first notebook');
          notebookSave.prime(first);
          storedNotebook = first;
          notebookList = [{ id: notebook.id, name: notebook.name }];
        } else {
          notebookList = rows.map((r) => ({ id: r.id, name: r.name }));
          const nb = await loadNotebook(rows[0].id);
          if (nb) {
            notebookSave.prime(nb);
            storedNotebook = structuredClone(nb);
            notebook = nb;
          }
        }
        const storedReader = await loadReaderState();
        readerSave.prime(storedReader);
        readerState = storedReader;
        const anns = await loadAnnotations();
        for (const a of anns) annotations = addAnnotation(annotations, a);
        // Seed each built-in card type once per install, ever (lib/builtin-seed.ts): new built-ins
        // reach existing users, deleted ones never return. After that the DB is the source of truth.
        // Part of the load itself, like the first notebook: persistOn() opens only once this succeeds.
        const types = await listCardTypes();
        const seededPref = await getPreference(BUILTIN_SEEDED_PREF);
        const seed = planBuiltinSeed({ existingIds: types.map((t) => t.id), seededPref, builtins: builtinCardTypes });
        for (const ct of seed.toSeed) {
          if (!(await saveCardType(ct))) throw new Error('could not seed the card types');
        }
        // Recorded only after the types are stored; a failed write is reported (onDbError) and the
        // next launch re-derives the same record, since seeded types are then in the table.
        const nextSeeded = JSON.stringify(seed.nextSeeded);
        if (nextSeeded !== seededPref) await setPreference(BUILTIN_SEEDED_PREF, nextSeeded);
        cardTypes = [...types, ...seed.toSeed];
        // Undo must never step back into the pre-hydration demo state (it would then be saved),
        // and a selection made on the demo must not dangle into the loaded notebook.
        clearHistory();
        selCard = null;
        selSection = null;
        if (savedFactory !== null) factorySave.prime(savedFactory);
        // Let the effects see the hydrated values while persistence is still off.
        await tick();
      }).then((ok) => {
        if (!ok) return;
        // The gate dropped every schedule while the load ran, including real edits made after
        // the stored values arrived: queue the current values now. Identical ones are skipped,
        // so an untouched launch writes nothing.
        notebookSave.schedule($state.snapshot(notebook) as Notebook);
        readerSave.schedule($state.snapshot(readerState) as ReaderStateMap);
        factorySave.schedule(serializeFactory());
        // Version history starts only now, never on pre-hydration state.
        versionList = [];
        if (storedNotebook && storedNotebook.id === notebook.id) void versionKeeper.opened(storedNotebook, true);
        else void versionKeeper.refresh(notebook.id);
      });
      void listen('menu://import-json', () => void handleImport()).then((un) => unlisteners.push(un));
      void listen('menu://export-json', () => void handleExport()).then((un) => unlisteners.push(un));
      void listen('menu://export-html', () => void handleShare()).then((un) => unlisteners.push(un));
      // Window close: the API destroys the window only after this handler resolves, so it must
      // never throw or hang — withTimeout resolves after 2s whatever the flush does.
      void getCurrentWindow()
        .onCloseRequested(async () => {
          await withTimeout(flushAll(), 2000);
        })
        .then((un) => unlisteners.push(un))
        .catch((err) => console.error('close-requested flush not installed', err));
      // Cmd+Q / app quit: Rust holds the exit, asks us to flush, and exits on exit_app (or after 3s).
      void listen('app://flush-then-exit', async () => {
        try {
          await withTimeout(flushAll(), 2000);
        } finally {
          await invoke('exit_app').catch(() => {});
        }
      })
        .then((un) => unlisteners.push(un))
        .catch((err) => console.error('quit flush not installed', err));
    }
    // Leaving the app (tab hidden, window blur) flushes everything right away.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushAll();
    };
    const onBlur = () => void flushAll();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    unlisteners.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    });
    function sectionCardsOf(cardId: string | null): string[] {
      if (!cardId) return [];
      for (const s of notebook.sections) {
        if (s.cards.some((c) => c.id === cardId)) return s.cards.map((c) => c.id);
      }
      return [];
    }
    function handleKey(e: KeyboardEvent) {
      // A modal dialog owns the keyboard: no undo, mode toggle or selection moves behind it.
      if (fromAiOpen || importProblems) return;
      const el = e.target as HTMLElement | null;
      const inField =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const cur = get(place);
      const ctx: KeyCtx = {
        inField,
        // CeText owns bare-Enter blur for single-line fields; the window handler never re-does it.
        singleLineField: false,
        place: cur,
        mode: get(mode),
        filterActive: mtxCells.length > 0,
        selCard,
        selSection,
        selProd,
        sectionIds: notebook.sections.filter((s) => s.kind !== 'divider').map((s) => s.id),
        cardIdsOfSelectedSection: sectionCardsOf(selCard),
      };
      const action = handleAppKey(e, ctx);
      if (!action) return;
      if (action.preventDefault) e.preventDefault();
      switch (action.kind) {
        case 'toggle-mode':
          if (inField) el?.blur();
          if (cur === 'factory') toggleFacMode();
          else if (get(mode) === 'edit') enterStudy();
          else toggleMode();
          break;
        case 'toast-save':
          void flushAll();
          toast(autosave.failed ? HYDRATION_FAILED_MESSAGE : 'everything autosaves — you’re always saved');
          break;
        case 'undo':
          toast(histUndo() ? 'undo' : 'nothing to undo');
          break;
        case 'redo':
          toast(histRedo() ? 'redo' : 'nothing to redo');
          break;
        case 'abort-or-blur':
          if (!histAbortEdit()) el?.blur();
          break;
        case 'clear-filter':
          mtxCells = [];
          break;
        case 'deselect':
          selProd = null;
          selCard = null;
          selSection = null;
          break;
        case 'select-section':
          selectSection(action.id);
          document
            .querySelector(`[data-section="${action.id}"]`)
            ?.scrollIntoView({ block: 'nearest' });
          break;
        case 'select-card':
          selectCard(action.id);
          break;
        case 'blur-single-line':
          el?.blur();
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      unlisteners.forEach((un) => un());
    };
  });

  // Debounced autosave whenever the document, reader state or factory changes (dropped until hydrated).
  $effect(() => notebookSave.schedule($state.snapshot(notebook) as Notebook));
  $effect(() => readerSave.schedule($state.snapshot(readerState) as ReaderStateMap));
  $effect(() => factorySave.schedule(serializeFactory()));
  $effect(() => {
    document.body.classList.toggle('side-collapsed', sideCollapsed);
  });

  function updateSlotProps(cardId: string, slotId: string, newProps: SlotProps) {
    for (const section of notebook.sections) {
      for (const card of section.cards) {
        if (card.id === cardId) {
          const slot = [...card.slots, ...(card.back ?? [])].find((s) => s.id === slotId);
          if (slot) slot.props = newProps;
        }
      }
    }
  }

  function onSlotState(card: Card, slotId: string, next: Record<string, unknown>) {
    if (stateLayerFor(card, slotId) === 'session') {
      session.live[card.id] = { ...session.live[card.id], ...(next as Scope) };
    } else {
      readerState[card.id] = { ...readerState[card.id], [slotId]: next };
    }
  }

  // progress is cross-card: gather the cards in its declared scope.
  function progressCards(section: Section, props: SlotProps): Card[] {
    return progressScopeCards(notebook, section, (props.scope as ProgressScope) ?? 'section');
  }

  // Distinct tags across the notebook — offered to ProgressEdit's track picker.
  // D26: cats is the tag identity and order; loaders derive it for pre-D26 data.
  const notebookTags = $derived(notebook.cats ?? []);
</script>

<TopBar
  notebooks={notebookList}
  currentId={notebook.id}
  {themeId}
  canSwitch={isTauri()}
  place={$place}
  factoryPreview={factory.preview}
  onswitch={(id) => void switchNotebook(id)}
  oncreate={newNotebook}
  onfromai={() => (fromAiOpen = true)}
  onsettheme={setTheme}
  onaddsection={() => {
    pushHistory();
    addSection(notebook);
  }}
  onaddchapter={() => {
    pushHistory();
    addChapter(notebook);
  }}
  onshare={() => void handleShare()}
  onexport={() => void handleExport()}
  onimport={() => void handleImport()}
  onplacehouse={() => {
    if (setPlace('house')) {
      selCard = null;
      selSection = null;
      selProd = null;
      factory.sel = null;
    }
  }}
  onplacefactory={() => {
    if (setPlace('factory')) {
      selCard = null;
      selSection = null;
      selProd = null;
      factory.sel = null;
    }
  }}
  onenterstudy={enterStudy}
  onfacmode={toggleFacMode}
  onaddbench={() => {
    pushHistory();
    addBench();
  }}
  canUndo={undoable}
  canRedo={redoable}
  onundo={() => { toast(histUndo() ? 'undo' : 'nothing to undo'); }}
  onredo={() => { toast(histRedo() ? 'redo' : 'nothing to redo'); }}
/>

{#snippet matrix()}
  <CoverageMatrix
    {notebook}
    {cardTypes}
    {mtxRow}
    {mtxCol}
    cells={mtxCells}
    fold={mtxFold}
    onaxis={setMatrixAxes}
    oncells={(c) => (mtxCells = c)}
    onfold={() => (mtxFold = !mtxFold)}
    onreordersections={(from, to) => reorderSectionsByValueIndex(notebook, from, to)}
  />
{/snippet}

{#snippet sectionTools(section: Section)}
  <div class="section-head">
    <input
      class="section-name"
      data-history="edit"
      value={section.name}
      disabled={section.locked}
      onchange={(e) => renameSection(notebook, section.id, e.currentTarget.value)}
    />
    <button
      title="Move section up"
      onclick={() => {
        pushHistory();
        moveSection(notebook, section.id, -1);
      }}>↑</button>
    <button
      title="Move section down"
      onclick={() => {
        pushHistory();
        moveSection(notebook, section.id, 1);
      }}>↓</button>
    {#if !section.locked}
      <button title="Delete section" onclick={() => void removeSection(section)}>✕</button>
    {/if}
  </div>
{/snippet}

{#snippet cardView(section: Section, card: Card, editable: boolean)}
  <CardView
    {card}
    surface={editable ? 'notebook' : 'read'}
    selected={selCard === card.id}
    state={readerState[card.id] ?? {}}
    live={session.live[card.id] ?? {}}
    notes={annotationsFor(annotations, card.id)}
    notesOpen={notesFor === card.id}
    onselect={() => selectCard(card.id)}
    onstate={(slotId, next) => onSlotState(card, slotId, next)}
    onmove={(dir) => {
      pushHistory();
      moveCard(notebook, card.id, dir);
    }}
    ondelete={() => removeCard(card.id)}
    onverb={(key, on) => setCardVerb(card, key, on)}
    ontags={(raw) => setCardTags(card, raw)}
    onsavetype={(name) => saveCardAsType(card, name)}
    onupdateslot={(slotId, props) => updateSlotProps(card.id, slotId, props)}
    ondeleteslot={(slotId) => {
      pushHistory();
      deleteSlot(notebook, card.id, slotId);
    }}
    onaddslot={(type, face) => {
      pushHistory();
      addSlot(notebook, card.id, type, face);
    }}
    progresscompletion={(props) =>
      computeProgress(progressCards(section, props), readerState, props.track as string[] | undefined)}
    alltags={notebookTags}
    ontogglenotes={() => (notesFor = notesFor === card.id ? null : card.id)}
    onaddnote={(body) => addNote(card.id, body)}
    ondeletenote={deleteNote}
    ongrip={(ev, el) => gripCard(card, ev, el)}
    onresize={(w) => setCardW(card, w)}
    onfusew={(leftId, rightId, lw, rw) => setFuseW(card, leftId, rightId, lw, rw)}
    pinEnabled={section.services?.pin === true}
    notesEnabled={section.services?.notes === true}
    archEnabled={$mode === 'study' && section.services?.archive === true}
    showArch={session.showArch[section.id] === true}
    onpin={() => togglePinCard(card)}
    onarchive={() => toggleArchiveCard(section, card)}
    onreviewed={() => reviewCard(card)}
  />
{/snippet}

{#snippet sectionFooter(section: Section)}
  <div class="add-row">
    <button
      class="add-card"
      onclick={() => {
        pushHistory();
        const ct = builtinCardTypes.find((t) => t.id === 'ct_note')!;
        const card = stampCard(ct, section.id, section.cards.length);
        section.cards.push(card);
      }}>+ note</button>
    <button
      class="add-card"
      onclick={() => (galleryFor = galleryFor === section.id ? null : section.id)}
    >+ from gallery</button>
  </div>
  {#if galleryFor === section.id}
    <div class="gallery">
      {#each cardTypes as ct (ct.id)}
        <div class="gallery-item">
          <button class="gallery-stamp" onclick={() => stampFromGallery(section.id, ct)}>
            <strong>{ct.name}</strong>
            {#if ct.description}<span>{ct.description}</span>{/if}
          </button>
          {#if !isBuiltinType(ct.id)}
            <button class="gallery-del" title="Delete card type" onclick={() => void removeCardType(ct)}>✕</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet stageFooter()}
  {#if $mode === 'edit'}
    <button
      class="add-section"
      onclick={() => {
        pushHistory();
        addSection(notebook);
      }}>+ section</button>
  {/if}
{/snippet}

<div id="main" style="--sidew:{sideW}px">
  {#if $place === 'factory'}
    <SideFactory
      {cardTypes}
      ondelprod={(ct) => void removeCardType(ct)}
      ongrip={gripProductFactory}
    />
  {:else}
    <SideBar
      notebookName={notebook.name}
      canPersist={isTauri()}
      {cardTypes}
      {selProd}
      section={selectedSection}
      card={selectedCard}
      cardstate={selectedCard ? (readerState[selectedCard.id] ?? {}) : {}}
      cardlive={selectedCard ? (session.live[selectedCard.id] ?? {}) : {}}
      alltags={notebookTags}
      oncardupdateslot={(slotId, props) => selectedCard && updateSlotProps(selectedCard.id, slotId, props)}
      oncardstate={(slotId, next) => selectedCard && onSlotState(selectedCard, slotId, next)}
      oncardduplicate={duplicateSelectedCard}
      oncardremove={() => selectedCard && removeCard(selectedCard.id)}
      oncardfactory={() => selectedCard && editCardInFactory(selectedCard)}
      oncardclose={() => (selCard = null)}
      tags={notebookTags}
      ontagtoggle={toggleCardTag}
      ontagrename={renameTagEverywhere}
      ontagdelete={deleteTagEverywhere}
      ontagadd={addFreeTag}
      ontaggrip={gripTag}
      onsvcgrip={gripSvc}
      onrename={renameNotebook}
      ondelete={() => void removeNotebook()}
      onpickprod={pickProduct}
      onplaceprod={placeProduct}
      onclosedetail={() => (selProd = null)}
      ongrip={gripProductHouse}
      onvariety={(v) => (selVariety = v)}
      onsvctoggle={toggleSectionService}
      drafts={draftsLeft}
      ondraftnext={() => void gotoNextDraft()}
      ondraftsreviewed={() => void markAllReviewed()}
      versions={versionList}
      onversionsave={() => void saveVersionNow()}
      onversionrestore={(id) => void restoreVersion(id)}
    />
  {/if}
  <div id="resizer" role="separator" aria-orientation="vertical" onpointerdown={startSideResize}></div>
  <div id="stage">
    {#if $place === 'factory'}
      <Factory
        onseal={handleSeal}
        ongripbench={gripBench}
        ongripslot={gripSlot}
        confirm={confirmDialog} />
    {:else}
      <Stage
        {notebook}
        {visibleCardIds}
        {selSection}
        onselect={selectSection}
        onrename={renameNotebook}
        onsubtitle={setNotebookSubtitle}
        onpatchsection={patchSection}
        onsectiongrip={gripSection}
        onsvcrun={runService}
        {cardView}
        {matrix}
        {sectionTools}
        {sectionFooter}
        {stageFooter}
      />
    {/if}
  </div>
</div>

<button
  id="sidebump"
  style="--sidew:{sideW}px"
  title={sideCollapsed ? 'show the panel' : 'hide the panel'}
  onclick={toggleSide}
>{sideCollapsed ? '›' : '‹'}</button>

{#if sealBench}
  <SealModal
    bench={sealBench}
    existing={sealExisting}
    taken={sealTaken}
    onconfirm={confirmSeal}
    oncancel={() => (sealBenchId = null)}
  />
{/if}

{#if fromAiOpen}
  <FromAiModal
    onclose={() => (fromAiOpen = false)}
    oncreate={createFromAi}
    oncopied={(what) => toast(what === 'prompt' ? 'Prompt copied — paste it into your AI chat' : 'Fix request copied — paste it back to your AI')}
  />
{/if}

{#if importProblems}
  <ImportReport
    errors={importProblems.errors}
    warnings={importProblems.warnings}
    title={importProblems.title}
    fixRequest={importProblems.fixRequest ?? true}
    onclose={() => (importProblems = null)}
    oncopied={() => toast('Fix request copied — paste it back to your AI')}
  />
{/if}

<MdBar />
<Toast />
<Dustbin />

<style>
  .section-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    /* keep the delete button clear of the absolute .room-lock in the corner */
    padding-right: 26px;
  }
  .section-name {
    flex: 1;
    font-size: 16px;
    background: transparent;
    color: inherit;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 4px 6px;
  }
  .section-name:hover,
  .section-name:focus {
    border-color: var(--line);
    background: var(--panel);
  }
  .section-head button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
    padding: 2px 4px;
  }
  .section-head button:hover {
    opacity: 1;
  }
  .add-card,
  .add-section {
    background: none;
    border: 1px dashed var(--line);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.6;
    padding: 4px 10px;
  }
  .add-card:hover,
  .add-section:hover {
    opacity: 1;
    border-color: var(--accent, #7c3aed);
  }
  .add-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .add-card {
    flex: 1;
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
    margin-bottom: 12px;
  }
  .gallery-item {
    position: relative;
  }
  .gallery-stamp {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    padding: 10px;
  }
  .gallery-stamp:hover {
    border-color: var(--accent, #7c3aed);
  }
  .gallery-stamp span {
    opacity: 0.6;
    font-size: 11px;
  }
  .gallery-del {
    position: absolute;
    top: 4px;
    right: 6px;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    opacity: 0.4;
    padding: 2px;
  }
  .gallery-del:hover {
    opacity: 1;
  }
  .add-section {
    width: 100%;
    padding: 8px;
  }
</style>
