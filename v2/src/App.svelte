<script lang="ts">
  import { mode, toggleMode } from './lib/stores/mode';
  import { getSlot, allSlots } from './lib/slots/registry';
  import { buildCardScope } from './lib/card-scope';
  import { isCardDone, CARD_STATE_KEY } from './lib/card-done';
  import { computeProgress } from './lib/progress';
  import { shouldShow, isLocked } from './lib/verbs';
  import VerbWrapper from './lib/slots/VerbWrapper.svelte';
  import ProgressStudy from './lib/slots/ProgressStudy.svelte';
  import TopBar from './lib/components/TopBar.svelte';
  import SideBar from './lib/components/SideBar.svelte';
  import CoverageMatrix from './lib/components/CoverageMatrix.svelte';
  import CardNotes from './lib/components/CardNotes.svelte';
  import MdBar from './lib/components/MdBar.svelte';
  import Toast from './lib/components/Toast.svelte';
  import { toast } from './lib/toast.svelte';
  import { addAnnotation, removeAnnotation, annotationsFor, type AnnotationMap } from './lib/annotations';
  import { filterCards, type MatrixSelection } from './lib/coverage-matrix';
  import type { ProgressProps } from './lib/slots/progress';
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
  import { demoNotebook } from './lib/demo';
  import {
    createNotebook,
    addSection,
    renameSection,
    deleteSection,
    moveSection,
    addCard,
    deleteCard,
    moveCard,
    addSlot,
    deleteSlot,
    moveCardBefore,
    moveSectionBefore,
  } from './lib/notebook-ops';
  import { importNotebookFromFile, exportNotebookToFile } from './lib/share';
  import { debounce } from './lib/debounce';
  import { applyTheme, normalizeThemeId, type ThemeId } from './lib/themes';
  import { listen } from '@tauri-apps/api/event';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { onMount } from 'svelte';

  // Reader state: cardId → slotId → arbitrary state object (persisted to SQLite inside Tauri)
  let readerState: Record<string, Record<string, Record<string, unknown>>> = $state({});

  let notebook: Notebook = $state(demoNotebook());
  let notebookList: { id: string; name: string }[] = $state([
    { id: 'nb_demo', name: 'My First Notebook' },
  ]);

  let newSlotType = $state('text');

  let cardTypes: CardType[] = $state([...builtinCardTypes]);
  let galleryFor: string | null = $state(null);
  let typeNameFor: string | null = $state(null);
  let typeNameDraft = $state('');

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

  function cardVisible(card: Card): boolean {
    return $mode === 'edit' || visibleCardIds === null || visibleCardIds.has(card.id);
  }

  function setCardTags(card: Card, raw: string) {
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 0) card.tags = tags;
    else delete card.tags;
  }

  // Persistence is active only inside the Tauri app; in a plain browser/tests it no-ops so the demo still runs.
  const persistNotebook = debounce((nb: Notebook) => {
    if (isTauri()) void saveNotebook({ ...nb, updatedAt: new Date().toISOString() });
  }, 600);
  const persistReaderState = debounce((map: typeof readerState) => {
    if (isTauri()) void saveReaderState(map);
  }, 600);

  function confirmDialog(msg: string, title: string): Promise<boolean> {
    return isTauri() ? confirm(msg, { title, kind: 'warning' }) : Promise.resolve(window.confirm(msg));
  }

  // ---- sidebar resize / collapse (v1 gesture: drag resizes, sub-4px click toggles) ----

  function clampSideW(x: number): number {
    return Math.max(220, Math.min(560, x));
  }

  function toggleSide() {
    sideCollapsed = !sideCollapsed;
    if (isTauri()) void setPreference('side_collapsed', sideCollapsed ? '1' : '0');
  }

  function startSideResize(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    let moved = false;
    function onMove(ev: PointerEvent) {
      if (Math.abs(ev.clientX - startX) > 4) moved = true;
      if (moved && !sideCollapsed) sideW = clampSideW(ev.clientX);
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved && !sideCollapsed) {
        sideW = clampSideW(ev.clientX);
        if (isTauri()) void setPreference('side_width', String(sideW));
      } else {
        toggleSide();
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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

  async function removeSection(section: Section) {
    if (section.cards.length > 0) {
      const ok = await confirmDialog(
        `Delete section "${section.name}" and its ${section.cards.length} card(s)?`,
        'Delete Section',
      );
      if (!ok) return;
    }
    deleteSection(notebook, section.id);
  }

  function setCardVerb(card: Card, key: 'flip' | 'bare', on: boolean) {
    const verbs = { ...card.verbs, [key]: on || undefined };
    card.verbs = verbs.flip || verbs.bare ? verbs : undefined;
    if (key === 'flip' && on && !card.back) card.back = [];
  }

  // ---- drag reorder (Edit mode) ----

  let dragCardId: string | null = $state(null);
  let dragSectionId: string | null = $state(null);

  function dropCard(sectionId: string, beforeCardId: string | null, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dragCardId) moveCardBefore(notebook, dragCardId, sectionId, beforeCardId);
    dragCardId = null;
  }

  function dropSection(beforeSectionId: string | null, e: DragEvent) {
    e.preventDefault();
    if (dragSectionId) moveSectionBefore(notebook, dragSectionId, beforeSectionId);
    dragSectionId = null;
  }

  function allowDrop(e: DragEvent) {
    if (dragCardId || dragSectionId) e.preventDefault();
  }

  // ---- gallery / factory ----

  function isBuiltinType(id: string): boolean {
    return builtinCardTypes.some((b) => b.id === id);
  }

  function stampFromGallery(sectionId: string, ct: CardType) {
    const section = notebook.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.cards.push(stampCard($state.snapshot(ct) as CardType, sectionId, section.cards.length));
    galleryFor = null;
  }

  function saveCardAsType(card: Card) {
    const name = typeNameDraft.trim();
    typeNameFor = null;
    if (!name) return;
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
        const [savedW, savedCollapsed] = await Promise.all([
          getPreference('side_width'),
          getPreference('side_collapsed'),
        ]);
        const w = savedW === null ? NaN : parseInt(savedW, 10);
        if (Number.isFinite(w)) sideW = clampSideW(w);
        sideCollapsed = savedCollapsed === '1';
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
        toggleMode();
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

  function isFlipped(card: Card): boolean {
    return readerState[card.id]?.[CARD_STATE_KEY]?.flipped === true;
  }

  // Flipping records seenBack so flip cards can count as done once both sides were viewed.
  function flipCard(card: Card) {
    const prev = readerState[card.id]?.[CARD_STATE_KEY] ?? {};
    const flipped = prev.flipped !== true;
    readerState[card.id] = {
      ...readerState[card.id],
      [CARD_STATE_KEY]: { ...prev, flipped, seenBack: prev.seenBack === true || flipped },
    };
  }

  function faceSlots(card: Card): typeof card.slots {
    return card.verbs?.flip && isFlipped(card) ? (card.back ?? []) : card.slots;
  }

  // Scope failures (e.g. a cycle authored in Edit mode) must be visible, not silently empty.
  // Variables are card-scoped: both faces of a flip card share one scope.
  function cardScope(card: Card): { scope: Record<string, number | boolean>; error: string } {
    try {
      return { scope: buildCardScope([...card.slots, ...(card.back ?? [])], {}), error: '' };
    } catch (e) {
      return { scope: {}, error: e instanceof Error ? e.message : String(e) };
    }
  }

  function slotState(cardId: string, slotId: string): Record<string, unknown> {
    return readerState[cardId]?.[slotId] ?? {};
  }

  function onSlotState(cardId: string, slotId: string, next: Record<string, unknown>) {
    readerState[cardId] = { ...readerState[cardId], [slotId]: next };
  }

  function cardDone(card: Card): boolean {
    return isCardDone(card, readerState[card.id] ?? {});
  }

  // A slot's prior completable siblings must all be done for a `sequential` slot to appear.
  function priorComplete(cardId: string, slots: Card['slots'], i: number): boolean {
    for (let j = 0; j < i; j++) {
      const s = slots[j];
      const t = getSlot(s.type);
      if (t?.completable && t.isDone && !t.isDone(s.props, slotState(cardId, s.id))) return false;
    }
    return true;
  }

  // progress is cross-card: gather the cards in its declared scope.
  function progressCards(section: Section, props: SlotProps): Card[] {
    return props.scope === 'notebook' ? notebook.sections.flatMap((s) => s.cards) : section.cards;
  }
</script>

<TopBar
  notebooks={notebookList}
  currentId={notebook.id}
  {themeId}
  canSwitch={isTauri()}
  onswitch={(id) => void switchNotebook(id)}
  oncreate={newNotebook}
  onsettheme={setTheme}
  onaddsection={() => addSection(notebook)}
  onexport={() => void handleExport()}
  onimport={() => void handleImport()}
/>

<div id="main" style="--sidew:{sideW}px">
  <SideBar
    notebookName={notebook.name}
    canPersist={isTauri()}
    onrename={renameNotebook}
    ondelete={() => void removeNotebook()}
  />
  <div id="resizer" role="separator" aria-orientation="vertical" onpointerdown={startSideResize}></div>
  <div id="stage">
    <div class="app">
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
    {#each notebook.sections as section (section.id)}
      <section class="section">
        {#if $mode === 'edit'}
          <div
            class="section-head"
            role="presentation"
            ondragover={allowDrop}
            ondrop={(e) => dropSection(section.id, e)}
          >
            <span
              class="drag-handle"
              role="presentation"
              draggable="true"
              ondragstart={() => (dragSectionId = section.id)}
              ondragend={() => (dragSectionId = null)}
            >⠿</span>
            <input
              class="section-name"
              value={section.name}
              onchange={(e) => renameSection(notebook, section.id, e.currentTarget.value)}
            />
            <button title="Move section up" onclick={() => moveSection(notebook, section.id, -1)}>↑</button>
            <button title="Move section down" onclick={() => moveSection(notebook, section.id, 1)}>↓</button>
            <button title="Delete section" onclick={() => void removeSection(section)}>✕</button>
          </div>
        {:else}
          <h2>{section.name}</h2>
        {/if}
        {#each section.cards.filter(cardVisible) as card (card.id)}
          {@const resolved = cardScope(card)}
          {@const scope = resolved.scope}
          {@const done = $mode === 'study' ? cardDone(card) : false}
          {@const face = $mode === 'study' ? faceSlots(card) : card.slots}
          <div
            class="card"
            class:done
            class:bare={card.verbs?.bare}
            class:flipped={$mode === 'study' && isFlipped(card)}
            role="presentation"
            ondragover={allowDrop}
            ondrop={(e) => dropCard(section.id, card.id, e)}
          >
            {#if $mode === 'study' && done}
              <div class="done-badge">Done</div>
            {/if}
            {#if $mode === 'study' && card.verbs?.flip}
              <button class="flip-toggle" onclick={() => flipCard(card)}>
                {isFlipped(card) ? '↩ Front' : 'Flip ↪'}
              </button>
            {/if}
            {#if $mode === 'study' && resolved.error}
              <div class="scope-error">Variables unavailable: {resolved.error}</div>
            {/if}
            {#if $mode === 'edit'}
              <div class="card-toolbar">
                <span
                  class="drag-handle"
                  role="presentation"
                  draggable="true"
                  ondragstart={() => (dragCardId = card.id)}
                  ondragend={() => (dragCardId = null)}
                >⠿</span>
                <button title="Move card up" onclick={() => moveCard(notebook, card.id, -1)}>↑</button>
                <button title="Move card down" onclick={() => moveCard(notebook, card.id, 1)}>↓</button>
                <label><input type="checkbox" checked={card.verbs?.flip === true} onchange={(e) => setCardVerb(card, 'flip', e.currentTarget.checked)} /> flip</label>
                <label><input type="checkbox" checked={card.verbs?.bare === true} onchange={(e) => setCardVerb(card, 'bare', e.currentTarget.checked)} /> bare</label>
                <input
                  class="tags-input"
                  placeholder="tags, comma-separated"
                  value={card.tags?.join(', ') ?? ''}
                  onchange={(e) => setCardTags(card, e.currentTarget.value)}
                />
                <span class="spacer"></span>
                {#if typeNameFor === card.id}
                  <input
                    class="type-name-input"
                    placeholder="Card type name"
                    bind:value={typeNameDraft}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') saveCardAsType(card);
                      if (e.key === 'Escape') typeNameFor = null;
                    }}
                  />
                  <button onclick={() => saveCardAsType(card)}>save</button>
                {:else}
                  <button
                    title="Save this card as a reusable card type"
                    onclick={() => {
                      typeNameFor = card.id;
                      typeNameDraft = '';
                    }}>→ type</button>
                {/if}
                <button title="Delete card" onclick={() => deleteCard(notebook, card.id)}>✕</button>
              </div>
              {#each card.slots as slot (slot.id)}
                {@const slotType = getSlot(slot.type)}
                {#if slotType}
                  <div class="slot editing">
                    <slotType.renderEdit props={slot.props} {scope} onUpdate={(p) => updateSlotProps(card.id, slot.id, p)} />
                    <button class="slot-del" title="Remove slot" onclick={() => deleteSlot(notebook, card.id, slot.id)}>✕</button>
                  </div>
                {/if}
              {/each}
              <div class="slot-adder">
                <select bind:value={newSlotType}>
                  {#each allSlots() as t (t.type)}
                    <option value={t.type}>{t.type}</option>
                  {/each}
                </select>
                <button onclick={() => addSlot(notebook, card.id, newSlotType)}>+ slot</button>
                {#if card.verbs?.flip}
                  <button onclick={() => addSlot(notebook, card.id, newSlotType, 'back')}>+ slot (back)</button>
                {/if}
              </div>
              {#if card.verbs?.flip}
                <div class="back-divider">Back</div>
                {#each card.back ?? [] as slot (slot.id)}
                  {@const slotType = getSlot(slot.type)}
                  {#if slotType}
                    <div class="slot editing">
                      <slotType.renderEdit props={slot.props} {scope} onUpdate={(p) => updateSlotProps(card.id, slot.id, p)} />
                      <button class="slot-del" title="Remove slot" onclick={() => deleteSlot(notebook, card.id, slot.id)}>✕</button>
                    </div>
                  {/if}
                {/each}
              {/if}
            {:else}
              {#each face as slot, i (slot.id)}
                {@const slotType = getSlot(slot.type)}
                {#if slotType}
                  <div class="slot">
                    <VerbWrapper
                      verbs={slot.verbs}
                      visible={shouldShow(slot.verbs, scope, priorComplete(card.id, face, i))}
                      locked={isLocked(slot.verbs?.locked, priorComplete(card.id, face, i))}
                    >
                      {#if slot.type === 'progress'}
                        <ProgressStudy
                          props={slot.props as ProgressProps}
                          completion={computeProgress(progressCards(section, slot.props), readerState)}
                        />
                      {:else}
                        <slotType.renderStudy
                          props={slot.props}
                          {scope}
                          state={slotState(card.id, slot.id)}
                          onState={(next) => onSlotState(card.id, slot.id, next)}
                        />
                      {/if}
                    </VerbWrapper>
                  </div>
                {/if}
              {/each}
              {@const noteCount = annotationsFor(annotations, card.id).length}
              <button
                class="notes-toggle"
                class:has-notes={noteCount > 0}
                onclick={() => (notesFor = notesFor === card.id ? null : card.id)}
              >
                ✎ {noteCount > 0 ? `notes (${noteCount})` : 'note'}
              </button>
              {#if notesFor === card.id}
                <CardNotes
                  notes={annotationsFor(annotations, card.id)}
                  onadd={(body) => addNote(card.id, body)}
                  ondelete={deleteNote}
                />
              {/if}
            {/if}
          </div>
        {/each}
        {#if $mode === 'edit'}
          <div class="add-row" role="presentation" ondragover={allowDrop} ondrop={(e) => dropCard(section.id, null, e)}>
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
        {/if}
      </section>
    {/each}
    {#if $mode === 'edit'}
      <button
        class="add-section"
        ondragover={allowDrop}
        ondrop={(e) => dropSection(null, e)}
        onclick={() => addSection(notebook)}
      >+ section</button>
    {/if}
    </div>
  </div>
</div>

<button
  id="sidebump"
  style="--sidew:{sideW}px"
  title={sideCollapsed ? 'show the panel' : 'hide the panel'}
  onclick={toggleSide}
>{sideCollapsed ? '›' : '‹'}</button>

<MdBar />
<Toast />

<style>
  .app {
    max-width: 800px;
    margin: 0 auto;
  }
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
  .tags-input {
    background: transparent;
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 11px;
    padding: 2px 6px;
    width: 150px;
  }
  .section h2 {
    font-size: 16px;
    margin-bottom: 12px;
    opacity: 0.7;
  }
  .section-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
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
  .drag-handle {
    cursor: grab;
    opacity: 0.35;
    font-size: 13px;
    user-select: none;
  }
  .drag-handle:hover {
    opacity: 0.8;
  }
  .section-head button,
  .card-toolbar button,
  .slot-del {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
    padding: 2px 4px;
  }
  .section-head button:hover,
  .card-toolbar button:hover,
  .slot-del:hover {
    opacity: 1;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    position: relative;
  }
  .card.bare {
    background: transparent;
    border: none;
    padding: 0;
  }
  .card.done {
    border-color: var(--accent, #7c3aed);
  }
  .card-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    opacity: 0.85;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px dashed var(--line);
  }
  .card-toolbar label {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    opacity: 0.7;
  }
  .card-toolbar .spacer {
    flex: 1;
  }
  .done-badge {
    position: absolute;
    top: 8px;
    right: 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--accent, #7c3aed);
    opacity: 0.8;
  }
  .flip-toggle {
    position: absolute;
    z-index: 1;
    top: 8px;
    right: 12px;
    background: none;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 8px;
  }
  .card.done .flip-toggle {
    right: 60px;
  }
  .back-divider {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.5;
    margin: 12px 0 8px;
    border-top: 1px dashed var(--line);
    padding-top: 8px;
  }
  .scope-error {
    font-size: 12px;
    color: #dc2626;
    margin-bottom: 8px;
  }
  .notes-toggle {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    opacity: 0.4;
    padding: 4px 0 0;
  }
  .notes-toggle:hover,
  .notes-toggle.has-notes {
    opacity: 0.8;
  }
  .notes-toggle.has-notes {
    color: var(--accent, #7c3aed);
  }
  .slot {
    margin-bottom: 8px;
  }
  .slot:last-child {
    margin-bottom: 0;
  }
  .slot.editing {
    display: flex;
    align-items: flex-start;
    gap: 4px;
  }
  .slot.editing > :global(:first-child) {
    flex: 1;
  }
  .slot-adder {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }
  .slot-adder select {
    background: var(--panel);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 12px;
    padding: 2px 6px;
  }
  .slot-adder button,
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
  .slot-adder button:hover,
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
  .type-name-input {
    background: var(--panel);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 12px;
    padding: 2px 6px;
    width: 140px;
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
