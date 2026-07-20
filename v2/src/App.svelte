<script lang="ts">
  import { mode, toggleMode } from './lib/stores/mode';
  import { computeProgress, progressScopeCards, type ProgressScope } from './lib/progress';
  import TopBar from './lib/components/TopBar.svelte';
  import SideBar from './lib/components/SideBar.svelte';
  import SideFactory from './lib/components/SideFactory.svelte';
  import Stage from './lib/components/Stage.svelte';
  import Factory from './lib/components/Factory.svelte';
  import SealModal from './lib/components/SealModal.svelte';
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
  } from './lib/db';
  import { uid } from './lib/uid';
  import { stampCard, placeType, cardToType, builtinCardTypes, STORES, type CardType, type Variety } from './lib/card-types';
  import type { SealOutcome } from './lib/seal';
  import { factory, addBench, serializeFactory, hydrateFactory, type Bench } from './lib/bench.svelte';
  import {
    registerHistory,
    clearHistory,
    pushHistory,
    undo as histUndo,
    redo as histRedo,
    abortEdit as histAbortEdit,
    type HistSnapshot,
  } from './lib/history.svelte';
  import { handleAppKey, type KeyCtx } from './lib/keyboard';
  import { installEditCoalescing } from './lib/history-focus';
  import { place, togglePlace } from './lib/stores/place';
  import { demoNotebook } from './lib/demo';
  import {
    createNotebook,
    addSection,
    addChapter,
    renameSection,
    deleteSection,
    moveSection,
    addCard,
    deleteCard,
    moveCard,
    addSlot,
    deleteSlot,
    reorderSectionsByValueIndex,
  } from './lib/notebook-ops';
  import { importNotebookFromFile, exportNotebookToFile, shareNotebookToFile } from './lib/share';
  import { session, shuffleSection, clearShuffle, resetSession } from './lib/session.svelte';
  import { togglePin, setArchived, flipAllCards, resetSectionState } from './lib/service-ops';
  import { resetPresentation } from './lib/presentation';
  import { SERVICE_FEATURES, SERVICE_ACTIONS, type ServiceKey } from './lib/services';
  import { debounce } from './lib/debounce';
  import { startEdgeResize } from './lib/drag/resize';
  import { startPointerDrag } from './lib/drag/engine';
  import { makeNotebookDropCallbacks } from './lib/drag/notebook-drop';
  import { makeFactoryDropCallbacks } from './lib/drag/factory-drop';
  import { clampSideW, parseSideWidthPref } from './lib/shell';
  import { applyTheme, normalizeThemeId, type ThemeId } from './lib/themes';
  import { listen } from '@tauri-apps/api/event';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  // Reader state: cardId → slotId → arbitrary state object (persisted to SQLite inside Tauri)
  let readerState: Record<string, Record<string, Record<string, unknown>>> = $state({});

  let notebook: Notebook = $state(demoNotebook());
  let notebookList: { id: string; name: string }[] = $state([
    { id: 'nb_demo', name: 'My First Notebook' },
  ]);

  let cardTypes: CardType[] = $state([...builtinCardTypes]);
  let galleryFor: string | null = $state(null);

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
    if (isTauri()) void setPreference('theme', id);
  }

  // Reader annotations: private layer on top of the document, never exported.
  let annotations: AnnotationMap = $state({});
  let notesFor: string | null = $state(null);

  function addNote(cardId: string, body: string) {
    const note = { id: uid('ann'), cardId, kind: 'note' as const, body, createdAt: new Date().toISOString() };
    annotations = addAnnotation(annotations, note);
    if (isTauri()) void saveAnnotation(note);
  }

  function deleteNote(id: string) {
    annotations = removeAnnotation(annotations, id);
    if (isTauri()) void deleteAnnotation(id);
  }

  // Effective axes (pure fallback) + matrix visibility, rebuilt from the selection.
  const matrixAxes = $derived(effectiveAxes(matrixDims(notebook, cardTypes), mtxRow, mtxCol));

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

  // Persistence is active only inside the Tauri app; in a plain browser/tests it no-ops so the demo still runs.
  const persistNotebook = debounce((nb: Notebook) => {
    if (isTauri()) void saveNotebook({ ...nb, updatedAt: new Date().toISOString() });
  }, 600);
  const persistReaderState = debounce((map: typeof readerState) => {
    if (isTauri()) void saveReaderState(map);
  }, 600);
  const persistFactory = debounce((json: string) => {
    if (isTauri()) void setPreference('factory_state', json);
  }, 600);

  function confirmDialog(msg: string, title: string): Promise<boolean> {
    return isTauri() ? confirm(msg, { title, kind: 'warning' }) : Promise.resolve(window.confirm(msg));
  }

  // ---- sidebar resize / collapse (v1 gesture: drag resizes, sub-4px click toggles) ----

  function toggleSide() {
    sideCollapsed = !sideCollapsed;
    if (isTauri()) void setPreference('side_collapsed', sideCollapsed ? '1' : '0');
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
          if (isTauri()) void setPreference('side_width', String(sideW));
        } else {
          toggleSide();
        }
      },
    );
  }

  // ---- notebook shell ----

  async function switchNotebook(id: string) {
    if (id === notebook.id) return;
    const nb = await loadNotebook(id);
    if (nb) {
      notebook = nb;
      notebookList = notebookList.map((e) => (e.id === nb.id ? { ...e, name: nb.name } : e));
      resetSession();
      clearHistory();
    }
  }

  function newNotebook() {
    const nb = createNotebook(`Notebook ${notebookList.length + 1}`);
    notebook = nb;
    notebookList = [{ id: nb.id, name: nb.name }, ...notebookList];
    resetSession();
    clearHistory();
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
    notebook = s.notebook;
    cardTypes = s.cardTypes;
    factory.benches = s.benches;
    factory.active = s.benchActive;
    selCard = null;
    selSection = null;
    selProd = null;
  }

  function renameNotebook(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === notebook.name) return;
    notebook.name = trimmed;
    notebookList = notebookList.map((e) =>
      e.id === notebook.id ? { ...e, name: trimmed } : e,
    );
  }

  async function removeNotebook() {
    const ok = await confirmDialog(
      `Delete notebook "${notebook.name}"? This cannot be undone.`,
      'Delete Notebook',
    );
    if (!ok) return;
    if (isTauri()) await deleteNotebook(notebook.id);
    notebookList = notebookList.filter((e) => e.id !== notebook.id);
    if (notebookList.length > 0 && isTauri()) {
      await switchNotebook(notebookList[0].id);
    } else {
      newNotebook();
    }
  }

  // ---- import / export ----

  async function handleImport() {
    const result = await importNotebookFromFile();
    if ('error' in result) {
      toast(result.error, 4000);
    } else if ('notebook' in result) {
      notebook = result.notebook;
      notebookList = [{ id: notebook.id, name: notebook.name }, ...notebookList];
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

  async function handleExport() {
    const result = await exportNotebookToFile($state.snapshot(notebook));
    if ('error' in result) {
      toast(result.error, 4000);
    } else if ('path' in result) {
      toast(`Exported to ${result.path}`);
    }
  }

  async function handleShare() {
    const result = await shareNotebookToFile($state.snapshot(notebook), themeId);
    if ('error' in result) {
      toast(result.error, 4000);
    } else if ('path' in result) {
      toast('Shared — one file, opens anywhere, fully interactive');
    }
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

  function setCardVerb(card: Card, key: 'flip' | 'bare', on: boolean) {
    pushHistory();
    const verbs = { ...card.verbs, [key]: on || undefined };
    card.verbs = verbs.flip || verbs.bare ? verbs : undefined;
    if (key === 'flip' && on && !card.back) card.back = [];
  }

  function setCardTags(card: Card, raw: string) {
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 0) card.tags = tags;
    else delete card.tags;
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

  // Sidebar chip click toggles the selected section's feature (v1 70-events.js:67).
  function toggleSectionService(key: ServiceKey) {
    if (!selectedSection) {
      toast('select a section first');
      return;
    }
    pushHistory();
    setSectionService(selectedSection, key, !selectedSection.services?.[key]);
  }

  // Native chip dropped on a section body enables the service (v1 100-drag-furniture.js:12-15).
  function attachSectionService(section: Section, key: ServiceKey) {
    if (section.kind === 'divider') return;
    pushHistory();
    setSectionService(section, key, true);
    toast(`added “${svcLabel(key)}” to ${section.name}`);
  }

  // Native chip dropped on the dustbin disables it on the selected section (v1 130-boot.js:22).
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
      if (isTauri()) void saveCardType($state.snapshot(ct) as CardType);
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
    if (isTauri()) void saveCardType(o.type);
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
    if (isTauri()) void saveCardType(ct);
    toast(`Saved card type "${name}"`);
  }

  async function removeCardType(ct: CardType) {
    const ok = await confirmDialog(`Delete card type "${ct.name}"?`, 'Delete Card Type');
    if (!ok) return;
    pushHistory();
    cardTypes = cardTypes.filter((t) => t.id !== ct.id);
    if (isTauri()) void deleteCardType(ct.id);
  }

  // Cmd+Enter to toggle mode; on launch, hydrate from SQLite when running as the app.
  onMount(() => {
    const unlisteners: Array<() => void> = [];
    registerHistory({ capture: captureHistory, restore: restoreHistory });
    unlisteners.push(installEditCoalescing());
    delete document.documentElement.dataset.theme;
    if (isTauri()) {
      void (async () => {
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
        const rows = await listNotebooks();
        if (rows.length === 0) {
          await saveNotebook($state.snapshot(notebook));
          notebookList = [{ id: notebook.id, name: notebook.name }];
        } else {
          notebookList = rows.map((r) => ({ id: r.id, name: r.name }));
          const nb = await loadNotebook(rows[0].id);
          if (nb) notebook = nb;
        }
        readerState = await loadReaderState();
        const anns = await loadAnnotations();
        for (const a of anns) annotations = addAnnotation(annotations, a);
        // Seed built-in card types once; after that the DB is the source of truth.
        const types = await listCardTypes();
        if (types.length === 0) {
          for (const ct of builtinCardTypes) await saveCardType(ct);
        } else {
          cardTypes = types;
        }
      })();
      void listen('menu://import-json', () => void handleImport()).then((un) => unlisteners.push(un));
      void listen('menu://export-json', () => void handleExport()).then((un) => unlisteners.push(un));
      void listen('menu://export-html', () => void handleShare()).then((un) => unlisteners.push(un));
    }
    function sectionCardsOf(cardId: string | null): string[] {
      if (!cardId) return [];
      for (const s of notebook.sections) {
        if (s.cards.some((c) => c.id === cardId)) return s.cards.map((c) => c.id);
      }
      return [];
    }
    function handleKey(e: KeyboardEvent) {
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
          toast('everything autosaves — you’re always saved');
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

  // Debounced autosave whenever the document or reader state changes.
  $effect(() => persistNotebook($state.snapshot(notebook)));
  $effect(() => persistReaderState($state.snapshot(readerState)));
  $effect(() => persistFactory(serializeFactory()));
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

  function onSlotState(cardId: string, slotId: string, next: Record<string, unknown>) {
    readerState[cardId] = { ...readerState[cardId], [slotId]: next };
  }

  // progress is cross-card: gather the cards in its declared scope.
  function progressCards(section: Section, props: SlotProps): Card[] {
    return progressScopeCards(notebook, section, (props.scope as ProgressScope) ?? 'section');
  }

  // Distinct tags across the notebook — offered to ProgressEdit's track picker.
  const notebookTags = $derived.by(() => {
    const seen = new Set<string>();
    for (const s of notebook.sections) for (const c of s.cards) for (const t of c.tags ?? []) seen.add(t);
    return [...seen];
  });
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
  onplace={togglePlace}
  onenterstudy={enterStudy}
  onfacmode={toggleFacMode}
  onaddbench={() => {
    pushHistory();
    addBench();
  }}
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
    {editable}
    selected={selCard === card.id}
    state={readerState[card.id] ?? {}}
    notes={annotationsFor(annotations, card.id)}
    notesOpen={notesFor === card.id}
    onselect={() => selectCard(card.id)}
    onstate={(slotId, next) => onSlotState(card.id, slotId, next)}
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
    archEnabled={$mode === 'study' && section.services?.archive === true}
    showArch={session.showArch[section.id] === true}
    onpin={() => togglePinCard(card)}
    onarchive={() => toggleArchiveCard(section, card)}
  />
{/snippet}

{#snippet sectionFooter(section: Section)}
  <div class="add-row">
    <button
      class="add-card"
      onclick={() => {
        pushHistory();
        addCard(notebook, section.id);
      }}>+ blank card</button>
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
      onrename={renameNotebook}
      ondelete={() => void removeNotebook()}
      onpickprod={pickProduct}
      onplaceprod={placeProduct}
      onclosedetail={() => (selProd = null)}
      ongrip={gripProductHouse}
      onvariety={(v) => (selVariety = v)}
      onsvctoggle={toggleSectionService}
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
        onsvcattach={attachSectionService}
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

<MdBar />
<Toast />
<Dustbin onsvcdrop={detachSectionService} />

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
