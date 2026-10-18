<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { mode, toggleMode } from '../stores/mode';
  import { THEMES, applyTheme, normalizeThemeId, type ThemeId } from '../themes';
  import { toast } from '../toast.svelte';
  import SideBar from './SideBar.svelte';
  import Stage from './Stage.svelte';
  import CardView from './CardView.svelte';
  import MdBar from './MdBar.svelte';
  import Toast from './Toast.svelte';
  import Dustbin from './Dustbin.svelte';
  import CoverageMatrix from './CoverageMatrix.svelte';
  import ResultsModal from './ResultsModal.svelte';
  import { computeProgress, progressScopeCards, type ProgressScope } from '../progress';
  import { addAnnotation, removeAnnotation, annotationsFor, type AnnotationMap } from '../annotations';
  import {
    matrixDims,
    effectiveAxes,
    pruneCells,
    cardMatchesFilter,
    type MatrixAxis,
  } from '../coverage-matrix';
  import type { Notebook, Card, Section, SlotProps } from '../types';
  import { uid } from '../uid';
  import { stampCard, placeType, cardToType, builtinCardTypes, type CardType, type Variety } from '../card-types';
  import {
    registerHistory,
    pushHistory,
    captureNow,
    pushSnapshot,
    undo as histUndo,
    redo as histRedo,
    abortEdit as histAbortEdit,
    canUndo,
    canRedo,
    type HistSnapshot,
  } from '../history.svelte';
  import { handleAppKey, type KeyCtx } from '../keyboard';
  import { installEditCoalescing } from '../history-focus';
  import { exportNotebook, importNotebook, validateNotebook, type NotebookJSON } from '../json-io';
  import { clampSideW } from '../shell';
  import {
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
  } from '../notebook-ops';
  import { session, shuffleSection, clearShuffle } from '../session.svelte';
  import { applyTag, removeTag, renameTag, deleteTag, tagUsage, createTag, setCardTags as setCardTagsOp } from '../tags';
  import { stateLayerFor } from '../slots/registry';
  import type { Scope } from '../variable-graph';
  import { togglePin, setArchived, flipAllCards, resetSectionState } from '../service-ops';
  import { resetPresentation } from '../presentation';
  import { SERVICE_FEATURES, SERVICE_ACTIONS, type ServiceKey } from '../services';
  import { startEdgeResize } from '../drag/resize';
  import { startPointerDrag } from '../drag/engine';
  import { makeNotebookDropCallbacks } from '../drag/notebook-drop';
  import { createProgressStore, installFlushOnHide, type LoadedProgress } from '../reader-store';

  let {
    notebook: initial,
    shared: sharedInit,
    initialTheme,
    initialState,
    storageKey,
    docId = '',
  }: {
    notebook: Notebook;
    shared: boolean;
    initialTheme?: string;
    /** Progress restored by reader-main before mount (reader-store's synchronous load). */
    initialState?: LoadedProgress;
    /** localStorage key this file's progress persists under; absent = keep nothing. */
    storageKey?: string;
    /** Document identity stamped on results exports. */
    docId?: string;
  } = $props();

  // The document lives entirely in memory here — no db, and it never touches localStorage: a
  // reload reopens the file. Only the reader/progress layer persists (reader-store), and only
  // while the file is still the shared original — Remix or Import diverges it and stops saving.
  let notebook: Notebook = $state(initial);
  // `shared` locks the file to reading; Remix (D10) unlocks the full author chrome in-memory.
  let shared = $state(sharedInit);
  let cardTypes: CardType[] = $state([...builtinCardTypes]);

  let readerState: Record<string, Record<string, Record<string, unknown>>> = $state(
    initialState?.readerState ?? {},
  );
  let annotations: AnnotationMap = $state(initialState?.annotations ?? {});
  let storageOk = $state(initialState?.available !== false);
  let resultsOpen = $state(false);
  // Keys are fixed from the pristine notebook as opened, before any in-session edit.
  const progressStore =
    storageKey && sharedInit
      ? createProgressStore({
          key: storageKey,
          notebook: initial,
          initial: initialState,
          onStatus: (ok) => (storageOk = ok),
        })
      : null;
  let notesFor: string | null = $state(null);
  let galleryFor: string | null = $state(null);

  let themeId: ThemeId = $state(normalizeThemeId(initialTheme ?? null));
  let openTheme = $state(false);

  let sideW = $state(312);
  let sideCollapsed = $state(false);

  let selSection: string | null = $state(null);
  let selCard: string | null = $state(null);
  let selProd: string | null = $state(null);
  let selVariety: Variety | null = $state(null);

  let mtxRow: MatrixAxis | null = $state(null);
  let mtxCol: MatrixAxis | null = $state(null);
  let mtxCells: string[] = $state([]);
  let mtxFold = $state(false);

  const themeChip = $derived(THEMES.find((t) => t.id === themeId)?.chip ?? THEMES[0].chip);
  const undoable = $derived(canUndo());
  const redoable = $derived(canRedo());

  const matrixAxes = $derived(effectiveAxes(matrixDims(notebook, cardTypes), mtxRow, mtxCol));

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

  $effect(() => {
    const [R, C] = effectiveAxes(matrixDims(notebook, cardTypes), mtxRow, mtxCol);
    const live = pruneCells(mtxCells, R, C);
    if (live.length !== mtxCells.length) mtxCells = live;
  });

  const selectedSection = $derived(
    notebook.sections.find((s) => s.id === selSection && s.kind !== 'divider') ?? null,
  );

  const selectedCard = $derived(selCard ? (findCard(notebook, selCard) ?? null) : null);

  // D26: cats is the tag identity and order; loaders derive it for pre-D26 data.
  const notebookTags = $derived(notebook.cats ?? []);

  const svcLabel = (key: string): string =>
    [...SERVICE_FEATURES, ...SERVICE_ACTIONS].find((d) => d.key === key)?.label ?? key;

  onMount(() => {
    registerHistory({ capture: captureHistory, restore: restoreHistory });
    // A shared file always opens locked into Study; Remix later unlocks the mode toggle.
    mode.set('study');
    applyTheme(themeId);
    // Arm in-place text edits for undo (v1 parity) — Remix unlocks editing but keeps this file's
    // history; without it, post-Remix text-slot edits would silently escape the undo stack.
    const uninstallEditCoalescing = installEditCoalescing();
    window.addEventListener('keydown', handleKey);
    // pagehide / tab-hidden are the last reliable moments to land a pending save.
    const uninstallFlush = installFlushOnHide(() => progressStore?.flush());
    return () => {
      window.removeEventListener('keydown', handleKey);
      uninstallEditCoalescing();
      uninstallFlush();
      progressStore?.flush();
      delete document.body.dataset.theme;
    };
  });

  // Debounced save of the reader layer (the store strips presentation and skips no-op writes).
  $effect(() => {
    const state = $state.snapshot(readerState) as typeof readerState;
    const notes = $state.snapshot(annotations) as AnnotationMap;
    if (shared) progressStore?.schedule(state, notes);
  });

  function sectionCardsOf(cardId: string | null): string[] {
    if (!cardId) return [];
    for (const s of notebook.sections) {
      if (s.cards.some((c) => c.id === cardId)) return s.cards.map((c) => c.id);
    }
    return [];
  }

  // Reader keyboard map: the same pure dispatcher as App, in a locked-into-house context.
  // Mode toggle and undo/redo are meaningful only after Remix, so they gate on `!shared`.
  function handleKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    const inField =
      !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const ctx: KeyCtx = {
      inField,
      singleLineField: false,
      place: 'house',
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
        if (shared) break;
        if (inField) el?.blur();
        if (get(mode) === 'edit') enterStudy();
        else toggleMode();
        break;
      case 'toast-save':
        toast('everything autosaves — you’re always saved');
        break;
      case 'undo':
        if (shared) break;
        toast(histUndo() ? 'undo' : 'nothing to undo');
        break;
      case 'redo':
        if (shared) break;
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
        document.querySelector(`[data-section="${action.id}"]`)?.scrollIntoView({ block: 'nearest' });
        break;
      case 'select-card':
        selectCard(action.id);
        break;
      case 'blur-single-line':
        el?.blur();
        break;
    }
  }

  $effect(() => {
    document.body.classList.toggle('side-collapsed', sideCollapsed);
  });

  function captureHistory(): HistSnapshot {
    return {
      notebook: $state.snapshot(notebook) as Notebook,
      cardTypes: $state.snapshot(cardTypes) as CardType[],
      benches: [],
      benchActive: null,
    };
  }

  function restoreHistory(s: HistSnapshot) {
    notebook = s.notebook;
    cardTypes = s.cardTypes;
    // D25 revised (BL4): keep a selection the restored state still contains; clear only dangling ones.
    if (selCard && !findCard(notebook, selCard)) selCard = null;
    if (selSection && !notebook.sections.some((x) => x.id === selSection)) selSection = null;
    if (selProd && !cardTypes.some((t) => t.id === selProd)) selProd = null;
  }

  // Save-as-type mirrors App, minus persistence: the type lives only in this session's list.
  function saveCardAsType(card: Card, name: string) {
    const ct = cardToType($state.snapshot(card) as Card, name);
    cardTypes = [...cardTypes, ct];
    toast(`Saved card type "${name}"`);
  }

  // Post-Remix export: JSON blob download of the in-memory notebook (browser blob, no Tauri).
  function exportJson() {
    const data = JSON.stringify(exportNotebook($state.snapshot(notebook) as Notebook), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${notebook.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported "${notebook.name}"`);
  }

  let fileInput: HTMLInputElement | null = $state(null);

  async function importJson(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      toast('File is not valid JSON', 4000);
      return;
    }
    const { errors, warnings } = validateNotebook(json);
    if (errors.length > 0) {
      toast(`Invalid notebook file:\n${errors.join('\n')}`, 4000);
      return;
    }
    progressStore?.stop(); // a different document now — its progress isn't this file's
    notebook = importNotebook(json as NotebookJSON);
    selCard = null;
    selSection = null;
    const n = warnings.length;
    if (n > 0) {
      toast(
        `Imported "${notebook.name}" — ⚠ ${n} formula${n > 1 ? 's' : ''} reference variables outside their card — variables are card-scoped; fuse those slots into one card`,
        6000,
      );
    } else {
      toast(`Imported "${notebook.name}"`);
    }
  }

  // D10 Remix: unlock authoring in memory. Edits never touch disk — a reload reopens the original.
  function remix() {
    // Land what the student already did, then stop: edits would drift the stable card keys.
    progressStore?.stop();
    shared = false;
    toast('Editing unlocked — changes stay in this file (a reload reopens the original)');
  }

  // Start over: forget this file's saved progress here and in memory (notes included).
  function resetProgress() {
    const ok = window.confirm(
      'Reset your progress in this notebook?\nYour answers, checkmarks and notes in this browser will be cleared.',
    );
    if (!ok) return;
    progressStore?.reset();
    readerState = {};
    annotations = {};
    notesFor = null;
    toast('your progress was reset');
  }

  function setTheme(id: ThemeId) {
    openTheme = false;
    themeId = id;
    applyTheme(id);
  }

  function toggleSide() {
    sideCollapsed = !sideCollapsed;
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
        if (mv === null) sideW = startW;
        else if (moved && !sideCollapsed) sideW = clampSideW(mv.clientX);
        else toggleSide();
      },
    );
  }

  // Edit→Study seal: wipe volatile flip/shuffle state on the transition into study, then flip.
  function enterStudy() {
    if (get(mode) !== 'edit') return;
    readerState = resetPresentation(readerState);
    session.shuf = {};
    session.live = {};
    toggleMode();
  }

  function setMatrixAxes(row: MatrixAxis | null, col: MatrixAxis | null) {
    mtxRow = row;
    mtxCol = col;
    mtxCells = [];
  }

  function selectSection(id: string | null) {
    selSection = id;
    selCard = null;
  }

  function selectCard(id: string) {
    selCard = id;
    selSection = null;
  }

  function setNotebookSubtitle(v: string) {
    if (v.trim()) notebook.subtitle = v;
    else delete notebook.subtitle;
  }

  function renameNotebook(name: string) {
    const trimmed = name.trim();
    if (trimmed) notebook.name = trimmed;
  }

  function patchSection(section: Section, patch: Partial<Section>) {
    const target = section as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete target[key];
      else target[key] = value;
    }
  }

  function removeSection(section: Section) {
    if (section.cards.length > 0 && !window.confirm(`Delete section "${section.name}" and its ${section.cards.length} card(s)?`)) {
      return;
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

  function duplicateSelectedCard() {
    if (!selCard) return;
    pushHistory();
    const copy = duplicateCard(notebook, selCard);
    if (copy) selCard = copy.id;
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
    const ok = window.confirm(
      `Delete tag “${tag}”?\nIt will be removed from ${used} card${used === 1 ? '' : 's'}. (Undoable)`,
    );
    if (!ok) return;
    pushHistory();
    deleteTag(notebook, tag);
    toast(`tag “${tag}” deleted (Undo to restore)`);
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

  function setCardVerb(card: Card, key: 'flip' | 'bare', on: boolean) {
    pushHistory();
    const verbs = { ...card.verbs, [key]: on || undefined };
    card.verbs = verbs.flip || verbs.bare ? verbs : undefined;
    if (key === 'flip' && on && !card.back) card.back = [];
  }

  function setCardTags(card: Card, raw: string) {
    setCardTagsOp(notebook, card.id, raw);
  }

  function setFuseW(card: Card, leftId: string, rightId: string, leftW: number, rightW: number) {
    const all = [...card.slots, ...(card.back ?? [])];
    const left = all.find((s) => s.id === leftId);
    const right = all.find((s) => s.id === rightId);
    if (!left || !right) return;
    left.fuseW = leftW;
    right.fuseW = rightW;
  }

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

  function toggleSectionService(key: ServiceKey) {
    const target =
      selectedSection ??
      notebook.sections.find((s) => s.kind !== 'divider' && s.cards.some((c) => c.id === selCard)) ??
      null;
    if (!target) {
      toast('select a section first');
      return;
    }
    pushHistory();
    setSectionService(target, key, !target.services?.[key]);
  }

  function attachSectionService(section: Section, key: ServiceKey) {
    if (section.kind === 'divider') return;
    pushHistory();
    setSectionService(section, key, true);
    toast(`added “${svcLabel(key)}” to ${section.name}`);
  }

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

  const cardTypeById = (id: string) => cardTypes.find((t) => t.id === id);

  const dropCallbacks = makeNotebookDropCallbacks({
    notebook: () => notebook,
    selectedCard: () => selCard,
    selectedSection: () => selSection,
    clearSelection: () => {
      selCard = null;
      selSection = null;
    },
    confirmDelete: (msg) => Promise.resolve(window.confirm(msg)),
    attachService: (sectionId, key) => {
      const section = notebook.sections.find((s) => s.id === sectionId);
      if (section) attachSectionService(section, key as ServiceKey);
    },
    detachService: (key) => detachSectionService(key as ServiceKey),
    cardType: (id) => {
      const t = cardTypeById(id);
      return t ? ($state.snapshot(t) as CardType) : undefined;
    },
    variety: (ct) => (ct.id === selProd ? selVariety : (ct.varieties?.[0] ?? null)),
  });

  function gripCard(card: Card, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'card', id: card.id, srcEl }, ev, dropCallbacks);
  }
  function gripSection(section: Section, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'section', id: section.id, srcEl }, ev, dropCallbacks);
  }
  function gripProductHouse(id: string, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'product', id, srcEl }, ev, dropCallbacks);
  }

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

  function stampFromGallery(sectionId: string, ct: CardType) {
    const section = notebook.sections.find((s) => s.id === sectionId);
    if (!section || section.kind === 'divider') return;
    pushHistory();
    section.cards.push(stampCard($state.snapshot(ct) as CardType, sectionId, section.cards.length));
    galleryFor = null;
  }

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

  function addNote(cardId: string, body: string) {
    annotations = addAnnotation(annotations, {
      id: uid('ann'),
      cardId,
      kind: 'note',
      body,
      createdAt: new Date().toISOString(),
    });
  }
  function deleteNote(id: string) {
    annotations = removeAnnotation(annotations, id);
  }

  function progressCards(section: Section, props: SlotProps): Card[] {
    return progressScopeCards(notebook, section, (props.scope as ProgressScope) ?? 'section');
  }

  function isBuiltinType(id: string): boolean {
    return builtinCardTypes.some((b) => b.id === id);
  }
</script>

<div id="top">
  <div class="brand">Note<b>Builder</b></div>
  <div class="places row" id="places">
    <span class="themewrap">
      <button
        class="btn"
        title="App theme — applies everywhere"
        aria-haspopup="menu"
        aria-expanded={openTheme}
        onclick={() => (openTheme = !openTheme)}
      >🎨 {themeChip} ▾</button>
      {#if openTheme}
        <div class="nbmenu thememenu" role="menu">
          {#each THEMES as t (t.id)}
            <button class="nbitem" class:on={t.id === themeId} role="menuitem" onclick={() => setTheme(t.id)}>
              {t.name}
            </button>
          {/each}
        </div>
      {/if}
    </span>
    <span class="brand-nb" title="a shared notebook">📓 {notebook.name}</span>
  </div>
  <div class="spacer"></div>
  <div class="row" id="topright">
    {#if shared}
      {#if progressStore && !storageOk}
        <span class="muted sm" data-note="no-storage" title="This browser is blocking local storage">Progress isn’t saved in this browser</span>
      {/if}
      <button
        class="btn sm"
        data-act="results"
        title="See your progress and send it to your teacher"
        onclick={() => (resultsOpen = true)}
      >📊 My results</button>
      <button
        class="btn sm primary"
        data-act="remix"
        title="Edit your own copy in this file (changes stay in this file)"
        onclick={remix}
      >✎ Remix</button>
    {:else}
      <button class="btn sm" class:on={$mode === 'edit'} onclick={() => { if ($mode !== 'edit') toggleMode(); }}>Edit</button>
      <button class="btn sm" class:on={$mode === 'study'} onclick={() => { if ($mode !== 'study') enterStudy(); }}>Study</button>
      {#if $mode === 'edit'}
        <button class="btn sm" onclick={() => { pushHistory(); addSection(notebook); }}>＋ section</button>
        <button class="btn sm" title="Add a chapter divider" onclick={() => { pushHistory(); addChapter(notebook); }}>＋ chapter</button>
      {/if}
      <span style="width:10px;display:inline-block"></span>
      <button class="btn sm" title="Undo" disabled={!undoable} onclick={() => toast(histUndo() ? 'undo' : 'nothing to undo')}>↶</button>
      <button class="btn sm" title="Redo" disabled={!redoable} onclick={() => toast(histRedo() ? 'redo' : 'nothing to redo')}>↷</button>
      <span style="width:10px;display:inline-block"></span>
      <button class="btn sm" title="Export notebook as JSON" data-act="export" onclick={exportJson}>⤓</button>
      <button class="btn sm" title="Import a notebook JSON file" data-act="import" onclick={() => fileInput?.click()}>⤒</button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        style="display:none"
        onchange={importJson}
      />
      <!-- T6: re-Share the in-memory notebook via blob download (buildShareHtml lands in T6). -->
    {/if}
  </div>
</div>

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
    <button title="Move section up" onclick={() => { pushHistory(); moveSection(notebook, section.id, -1); }}>↑</button>
    <button title="Move section down" onclick={() => { pushHistory(); moveSection(notebook, section.id, 1); }}>↓</button>
    {#if !section.locked}
      <button title="Delete section" onclick={() => removeSection(section)}>✕</button>
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
    onmove={(dir) => { pushHistory(); moveCard(notebook, card.id, dir); }}
    ondelete={() => removeCard(card.id)}
    onverb={(key, on) => setCardVerb(card, key, on)}
    ontags={(raw) => setCardTags(card, raw)}
    onsavetype={(name) => saveCardAsType(card, name)}
    onupdateslot={(slotId, props) => updateSlotProps(card.id, slotId, props)}
    ondeleteslot={(slotId) => { pushHistory(); deleteSlot(notebook, card.id, slotId); }}
    onaddslot={(type, face) => { pushHistory(); addSlot(notebook, card.id, type, face); }}
    progresscompletion={(props) =>
      computeProgress(progressCards(section, props), readerState, props.track as string[] | undefined)}
    alltags={notebookTags}
    ontogglenotes={() => (notesFor = notesFor === card.id ? null : card.id)}
    onaddnote={(body) => addNote(card.id, body)}
    ondeletenote={deleteNote}
    ongrip={(ev, el) => gripCard(card, ev, el)}
    onresize={(w) => (card.w = w)}
    onfusew={(leftId, rightId, lw, rw) => setFuseW(card, leftId, rightId, lw, rw)}
    pinEnabled={section.services?.pin === true}
    notesEnabled={section.services?.notes === true}
    archEnabled={$mode === 'study' && section.services?.archive === true}
    showArch={session.showArch[section.id] === true}
    onpin={() => togglePinCard(card)}
    onarchive={() => toggleArchiveCard(section, card)}
  />
{/snippet}

{#snippet sectionFooter(section: Section)}
  <div class="add-row">
    <button class="add-card" onclick={() => { pushHistory(); const ct = builtinCardTypes.find((t: CardType) => t.id === 'ct_note')!; const card = stampCard(ct, section.id, section.cards.length); section.cards.push(card); }}>+ note</button>
    <button class="add-card" onclick={() => (galleryFor = galleryFor === section.id ? null : section.id)}>+ from gallery</button>
  </div>
  {#if galleryFor === section.id}
    <div class="gallery">
      {#each cardTypes as ct (ct.id)}
        <div class="gallery-item">
          <button class="gallery-stamp" onclick={() => stampFromGallery(section.id, ct)}>
            <strong>{ct.name}</strong>
            {#if ct.description}<span>{ct.description}</span>{/if}
          </button>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet stageFooter()}
  {#if $mode === 'edit'}
    <button class="add-section" onclick={() => { pushHistory(); addSection(notebook); }}>+ section</button>
  {/if}
  <footer class="madewith">
    <a href="https://github.com/YuZh98/notebuilder" target="_blank" rel="noopener">Made with NoteBuilder</a>
  </footer>
{/snippet}

<div id="main" style="--sidew:{sideW}px">
  <SideBar
    notebookName={notebook.name}
    canPersist={false}
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
    oncardclose={() => (selCard = null)}
    tags={notebookTags}
    ontagtoggle={toggleCardTag}
    ontagrename={renameTagEverywhere}
    ontagdelete={deleteTagEverywhere}
    ontagadd={addFreeTag}
    ontaggrip={gripTag}
    onsvcgrip={gripSvc}
    onrename={renameNotebook}
    ondelete={() => {}}
    candelete={false}
    onpickprod={pickProduct}
    onplaceprod={placeProduct}
    onclosedetail={() => (selProd = null)}
    ongrip={gripProductHouse}
    onvariety={(v) => (selVariety = v)}
    onsvctoggle={toggleSectionService}
  />
  <div id="resizer" role="separator" aria-orientation="vertical" onpointerdown={startSideResize}></div>
  <div id="stage">
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
  </div>
</div>

<button
  id="sidebump"
  style="--sidew:{sideW}px"
  title={sideCollapsed ? 'show the panel' : 'hide the panel'}
  onclick={toggleSide}
>{sideCollapsed ? '›' : '‹'}</button>

{#if resultsOpen}
  <ResultsModal
    {notebook}
    {readerState}
    {docId}
    onclose={() => (resultsOpen = false)}
    onreset={shared ? resetProgress : undefined}
  />
{/if}

<MdBar />
<Toast />
<Dustbin />

<style>
  .brand-nb {
    font-weight: 600;
    padding: 0 6px;
    opacity: 0.9;
  }
  .section-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
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
  .add-section {
    width: 100%;
    padding: 8px;
  }
  .madewith {
    text-align: center;
    font-size: 11px;
    opacity: 0.55;
    padding: 28px 0 10px;
  }
  .madewith a {
    color: inherit;
  }
  .madewith a:hover {
    opacity: 1;
    color: var(--accent);
  }
</style>
