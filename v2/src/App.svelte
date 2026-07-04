<script lang="ts">
  import { mode, toggleMode } from './lib/stores/mode';
  import { getSlot, allSlots } from './lib/slots/registry';
  import { buildCardScope } from './lib/card-scope';
  import { isCardDone, CARD_STATE_KEY } from './lib/card-done';
  import { computeProgress } from './lib/progress';
  import { shouldShow, isLocked } from './lib/verbs';
  import VerbWrapper from './lib/slots/VerbWrapper.svelte';
  import ProgressStudy from './lib/slots/ProgressStudy.svelte';
  import NotebookSwitcher from './lib/components/NotebookSwitcher.svelte';
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
  } from './lib/db';
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
  } from './lib/notebook-ops';
  import { importNotebookFromFile, exportNotebookToFile } from './lib/share';
  import { debounce } from './lib/debounce';
  import { listen } from '@tauri-apps/api/event';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { onMount } from 'svelte';

  // Reader state: cardId → slotId → arbitrary state object (persisted to SQLite inside Tauri)
  let readerState: Record<string, Record<string, Record<string, unknown>>> = $state({});

  let notebook: Notebook = $state(demoNotebook());
  let notebookList: { id: string; name: string }[] = $state([
    { id: 'nb_demo', name: 'My First Notebook' },
  ]);

  let shareError = $state('');
  let shareNotice = $state('');
  let newSlotType = $state('text');

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
    notebook.name = name;
    notebookList = notebookList.map((e) => (e.id === notebook.id ? { ...e, name } : e));
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
    shareError = '';
    shareNotice = '';
    const result = await importNotebookFromFile();
    if ('error' in result) {
      shareError = result.error;
    } else if ('notebook' in result) {
      notebook = result.notebook;
      notebookList = [{ id: notebook.id, name: notebook.name }, ...notebookList];
      shareNotice = `Imported "${notebook.name}"`;
    }
  }

  async function handleExport() {
    shareError = '';
    shareNotice = '';
    const result = await exportNotebookToFile($state.snapshot(notebook));
    if ('error' in result) {
      shareError = result.error;
    } else if ('path' in result) {
      shareNotice = `Exported to ${result.path}`;
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

  // Cmd+Enter to toggle mode; on launch, hydrate from SQLite when running as the app.
  onMount(() => {
    const unlisteners: Array<() => void> = [];
    if (isTauri()) {
      void (async () => {
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

<div class="app">
  <header>
    <NotebookSwitcher
      list={notebookList}
      currentId={notebook.id}
      currentName={notebook.name}
      canSwitch={isTauri()}
      onswitch={(id) => void switchNotebook(id)}
      oncreate={newNotebook}
      onrename={renameNotebook}
      ondelete={() => void removeNotebook()}
    />
    <button class="mode-toggle" class:study={$mode === 'study'} onclick={toggleMode}>
      {$mode === 'edit' ? 'Edit' : 'Study'}
    </button>
    <span class="hint">⌘+Enter to toggle</span>
  </header>

  {#if shareError}
    <div class="banner error" role="alert">
      <pre>{shareError}</pre>
      <button class="banner-close" onclick={() => (shareError = '')}>×</button>
    </div>
  {/if}
  {#if shareNotice}
    <div class="banner notice" role="status">
      <span>{shareNotice}</span>
      <button class="banner-close" onclick={() => (shareNotice = '')}>×</button>
    </div>
  {/if}

  <main>
    {#each notebook.sections as section (section.id)}
      <section class="section">
        {#if $mode === 'edit'}
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
        {:else}
          <h2>{section.name}</h2>
        {/if}
        {#each section.cards as card (card.id)}
          {@const resolved = $mode === 'study' ? cardScope(card) : { scope: {}, error: '' }}
          {@const scope = resolved.scope}
          {@const done = $mode === 'study' ? cardDone(card) : false}
          {@const face = $mode === 'study' ? faceSlots(card) : card.slots}
          <div class="card" class:done class:bare={card.verbs?.bare} class:flipped={$mode === 'study' && isFlipped(card)}>
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
                <button title="Move card up" onclick={() => moveCard(notebook, card.id, -1)}>↑</button>
                <button title="Move card down" onclick={() => moveCard(notebook, card.id, 1)}>↓</button>
                <label><input type="checkbox" checked={card.verbs?.flip === true} onchange={(e) => setCardVerb(card, 'flip', e.currentTarget.checked)} /> flip</label>
                <label><input type="checkbox" checked={card.verbs?.bare === true} onchange={(e) => setCardVerb(card, 'bare', e.currentTarget.checked)} /> bare</label>
                <span class="spacer"></span>
                <button title="Delete card" onclick={() => deleteCard(notebook, card.id)}>✕</button>
              </div>
              {#each card.slots as slot (slot.id)}
                {@const slotType = getSlot(slot.type)}
                {#if slotType}
                  <div class="slot editing">
                    <slotType.renderEdit props={slot.props} onUpdate={(p) => updateSlotProps(card.id, slot.id, p)} />
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
                      <slotType.renderEdit props={slot.props} onUpdate={(p) => updateSlotProps(card.id, slot.id, p)} />
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
            {/if}
          </div>
        {/each}
        {#if $mode === 'edit'}
          <button class="add-card" onclick={() => addCard(notebook, section.id)}>+ card</button>
        {/if}
      </section>
    {/each}
    {#if $mode === 'edit'}
      <button class="add-section" onclick={() => addSection(notebook)}>+ section</button>
    {/if}
  </main>
</div>

<style>
  .app {
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .hint {
    font-size: 12px;
    opacity: 0.5;
  }
  .mode-toggle {
    padding: 6px 16px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }
  .mode-toggle.study {
    background: var(--accent);
    color: var(--bg);
  }
  .banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 13px;
  }
  .banner pre {
    flex: 1;
    white-space: pre-wrap;
    font: inherit;
    margin: 0;
  }
  .banner span {
    flex: 1;
  }
  .banner.error {
    background: color-mix(in srgb, #dc2626 15%, var(--surface));
    border: 1px solid #dc2626;
  }
  .banner.notice {
    background: color-mix(in srgb, var(--accent, #7c3aed) 15%, var(--surface));
    border: 1px solid var(--accent, #7c3aed);
  }
  .banner-close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    padding: 0;
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
    border-color: var(--border);
    background: var(--surface);
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
    background: var(--surface);
    border: 1px solid var(--border);
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
    border-bottom: 1px dashed var(--border);
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
    border: 1px solid var(--border);
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
    border-top: 1px dashed var(--border);
    padding-top: 8px;
  }
  .scope-error {
    font-size: 12px;
    color: #dc2626;
    margin-bottom: 8px;
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
    background: var(--surface);
    color: inherit;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    padding: 2px 6px;
  }
  .slot-adder button,
  .add-card,
  .add-section {
    background: none;
    border: 1px dashed var(--border);
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
  .add-card {
    width: 100%;
    margin-bottom: 12px;
  }
  .add-section {
    width: 100%;
    padding: 8px;
  }
</style>
