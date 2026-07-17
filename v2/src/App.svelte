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
  import { filterCards, type MatrixSelection } from './lib/coverage-matrix';
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
  import { stampCard, cardToType, builtinCardTypes, type CardType } from './lib/card-types';
  import type { SealOutcome } from './lib/seal';
  import { factory, addBench, serializeFactory, hydrateFactory } from './lib/bench.svelte';
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
  } from './lib/notebook-ops';
  import { importNotebookFromFile, exportNotebookToFile } from './lib/share';
  import { debounce } from './lib/debounce';
  import { startEdgeResize } from './lib/drag/resize';
  import { startPointerDrag } from './lib/drag/engine';
  import { makeNotebookDropCallbacks } from './lib/drag/notebook-drop';
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

  let showMatrix = $state(false);
  let matrixFilter: MatrixSelection | null = $state(null);

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

  const allCards = $derived(notebook.sections.flatMap((s) => s.cards));
  // null = no filter (show everything)
  const visibleCardIds = $derived.by(() => {
    const f = matrixFilter;
    if (f === null) return null;
    return new Set(filterCards(allCards, f.rowAxis, f.rowVal, f.colAxis, f.colVal, readerState).map((c) => c.id));
  });

  // Edit-mode selection (v1 sel/selKind): a section OR a card, never both; Escape clears.
  let selSection: string | null = $state(null);
  let selCard: string | null = $state(null);

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
    }
  }

  function newNotebook() {
    const nb = createNotebook(`Notebook ${notebookList.length + 1}`);
    notebook = nb;
    notebookList = [{ id: nb.id, name: nb.name }, ...notebookList];
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
      toast(`Imported "${notebook.name}"`);
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
    deleteSection(notebook, section.id);
  }

  function removeCard(cardId: string) {
    if (selCard === cardId) selCard = null;
    deleteCard(notebook, cardId);
  }

  function setCardVerb(card: Card, key: 'flip' | 'bare', on: boolean) {
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

  // ---- drag reorder / dust delete (Edit mode, pointer engine) ----

  const dropCallbacks = makeNotebookDropCallbacks({
    notebook: () => notebook,
    selectedCard: () => selCard,
    selectedSection: () => selSection,
    clearSelection: () => {
      selCard = null;
      selSection = null;
    },
    confirmDelete: confirmDialog,
  });

  function gripCard(card: Card, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'card', id: card.id, srcEl }, ev, dropCallbacks);
  }

  function gripSection(section: Section, ev: PointerEvent, srcEl: HTMLElement) {
    startPointerDrag({ kind: 'section', id: section.id, srcEl }, ev, dropCallbacks);
  }

  // ---- gallery / factory ----

  function toggleFacMode() {
    factory.preview = !factory.preview;
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
    section.cards.push(stampCard($state.snapshot(ct) as CardType, sectionId, section.cards.length));
    galleryFor = null;
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
    cardTypes = cardTypes.filter((t) => t.id !== ct.id);
    if (isTauri()) void deleteCardType(ct.id);
  }

  // Cmd+Enter to toggle mode; on launch, hydrate from SQLite when running as the app.
  onMount(() => {
    const unlisteners: Array<() => void> = [];
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
    }
    function handleKey(e: KeyboardEvent) {
      if (e.metaKey && e.key === 'Enter') {
        e.preventDefault();
        if (get(place) === 'factory') toggleFacMode();
        else toggleMode();
      }
      if (e.key === 'Escape') {
        selSection = null;
        selCard = null;
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
  onaddsection={() => addSection(notebook)}
  onaddchapter={() => addChapter(notebook)}
  onexport={() => void handleExport()}
  onimport={() => void handleImport()}
  onplace={togglePlace}
  onfacmode={toggleFacMode}
  onaddbench={() => addBench()}
/>

{#snippet matrix()}
  {#if $mode === 'study'}
    <button class="matrix-toggle" class:on={showMatrix} onclick={() => (showMatrix = !showMatrix)}>
      Matrix
    </button>
    {#if showMatrix}
      <CoverageMatrix
        cards={allCards}
        states={readerState}
        selection={matrixFilter}
        onselect={(sel) => (matrixFilter = sel)}
      />
    {/if}
  {/if}
{/snippet}

{#snippet sectionTools(section: Section)}
  <div class="section-head">
    <input
      class="section-name"
      value={section.name}
      onchange={(e) => renameSection(notebook, section.id, e.currentTarget.value)}
    />
    <button title="Move section up" onclick={() => moveSection(notebook, section.id, -1)}>↑</button>
    <button title="Move section down" onclick={() => moveSection(notebook, section.id, 1)}>↓</button>
    <button title="Delete section" onclick={() => void removeSection(section)}>✕</button>
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
    onmove={(dir) => moveCard(notebook, card.id, dir)}
    ondelete={() => removeCard(card.id)}
    onverb={(key, on) => setCardVerb(card, key, on)}
    ontags={(raw) => setCardTags(card, raw)}
    onsavetype={(name) => saveCardAsType(card, name)}
    onupdateslot={(slotId, props) => updateSlotProps(card.id, slotId, props)}
    ondeleteslot={(slotId) => deleteSlot(notebook, card.id, slotId)}
    onaddslot={(type, face) => addSlot(notebook, card.id, type, face)}
    progresscompletion={(props) => computeProgress(progressCards(section, props), readerState)}
    ontogglenotes={() => (notesFor = notesFor === card.id ? null : card.id)}
    onaddnote={(body) => addNote(card.id, body)}
    ondeletenote={deleteNote}
    ongrip={(ev, el) => gripCard(card, ev, el)}
    onresize={(w) => setCardW(card, w)}
    onfusew={(leftId, rightId, lw, rw) => setFuseW(card, leftId, rightId, lw, rw)}
  />
{/snippet}

{#snippet sectionFooter(section: Section)}
  <div class="add-row">
    <button class="add-card" onclick={() => addCard(notebook, section.id)}>+ blank card</button>
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
    <button class="add-section" onclick={() => addSection(notebook)}>+ section</button>
  {/if}
{/snippet}

<div id="main" style="--sidew:{sideW}px">
  {#if $place === 'factory'}
    <SideFactory />
  {:else}
    <SideBar
      notebookName={notebook.name}
      canPersist={isTauri()}
      onrename={renameNotebook}
      ondelete={() => void removeNotebook()}
    />
  {/if}
  <div id="resizer" role="separator" aria-orientation="vertical" onpointerdown={startSideResize}></div>
  <div id="stage">
    {#if $place === 'factory'}
      <Factory onseal={handleSeal} />
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
<Dustbin />

<style>
  .matrix-toggle {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 13px;
  }
  .matrix-toggle.on {
    border-color: var(--accent, #7c3aed);
    color: var(--accent, #7c3aed);
  }
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
