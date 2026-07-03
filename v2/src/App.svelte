<script lang="ts">
  import { mode, toggleMode } from './lib/stores/mode';
  import { getSlot } from './lib/slots/registry';
  import { buildCardScope } from './lib/card-scope';
  import { isCardDone } from './lib/card-done';
  import { computeProgress } from './lib/progress';
  import { shouldShow, isLocked } from './lib/verbs';
  import VerbWrapper from './lib/slots/VerbWrapper.svelte';
  import ProgressStudy from './lib/slots/ProgressStudy.svelte';
  import type { ProgressProps } from './lib/slots/progress';
  import type { Notebook, Card, Section, SlotProps } from './lib/types';
  import { isTauri, loadNotebook, saveNotebook, loadReaderState, saveReaderState } from './lib/db';
  import { adoptNotebookIdentity } from './lib/json-io';
  import { importNotebookFromFile, exportNotebookToFile } from './lib/share';
  import { debounce } from './lib/debounce';
  import { listen } from '@tauri-apps/api/event';
  import { onMount } from 'svelte';

  // Reader state: cardId → slotId → arbitrary state object (persisted to SQLite inside Tauri)
  let readerState: Record<string, Record<string, Record<string, unknown>>> = $state({});

  // Demo notebook for initial vertical stack validation
  let notebook: Notebook = $state({
    id: 'nb_1',
    name: 'My First Notebook',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_1',
        notebookId: 'nb_1',
        name: 'Introduction',
        position: 0,
        cards: [
          {
            id: 'card_1',
            sectionId: 'sec_1',
            position: 0,
            slots: [
              { id: 'slot_1', type: 'text', props: { text: 'Hello **NoteBuilder** v2!\n\nThis is a `text` slot rendering in *Study* mode.' } },
            ],
          },
          {
            id: 'card_2',
            sectionId: 'sec_1',
            position: 1,
            slots: [
              { id: 'slot_s', type: 'slider', props: { key: 'a', value: 2, min: -5, max: 5, step: 0.5 } },
              { id: 'slot_c', type: 'compute', props: { expr: 'a * a', out: 'aSquared', note: 'a² =' } },
              { id: 'slot_t', type: 'text', props: { text: 'Slope **a = {{a}}** drives the line below; a² = {{aSquared}}.' }, verbs: { reveal: { key: 'a', op: '>=', val: 0 } } },
              { id: 'slot_g', type: 'chart', props: { fn: 'a * x', label: 'y = a·x', x0: -5, x1: 5 } },
            ],
          },
          {
            id: 'card_3',
            sectionId: 'sec_1',
            position: 2,
            slots: [
              { id: 'slot_q', type: 'text', props: { text: 'What is the derivative of x²?' } },
              { id: 'slot_ti', type: 'text-input', props: { placeholder: 'Type your answer...', key: 'answer' } },
            ],
          },
          {
            id: 'card_4',
            sectionId: 'sec_1',
            position: 3,
            slots: [
              { id: 'slot_pr', type: 'progress', props: { scope: 'section', label: 'Section progress', show: { mn: true, pct: true, bar: true } } },
            ],
          },
        ],
      },
    ],
  });

  // Persistence is active only inside the Tauri app; in a plain browser/tests it no-ops so the demo still runs.
  const persistNotebook = debounce((nb: Notebook) => {
    if (isTauri()) void saveNotebook(nb);
  }, 600);
  const persistReaderState = debounce((map: typeof readerState) => {
    if (isTauri()) void saveReaderState(map);
  }, 600);

  let shareError = $state('');
  let shareNotice = $state('');

  async function handleImport() {
    shareError = '';
    shareNotice = '';
    const result = await importNotebookFromFile(notebook.name);
    if ('error' in result) {
      shareError = result.error;
    } else if ('notebook' in result) {
      // Single-notebook app for now: the import takes over the current notebook's identity
      // so autosave overwrites it and the next launch loads the imported content.
      notebook = adoptNotebookIdentity(result.notebook, notebook.id);
      readerState = {};
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

  // Cmd+Enter to toggle mode; on launch, hydrate from SQLite when running as the app.
  onMount(() => {
    const unlisteners: Array<() => void> = [];
    if (isTauri()) {
      void loadNotebook(notebook.id).then((nb) => {
        if (nb) notebook = nb;
      });
      void loadReaderState().then((map) => {
        readerState = map;
      });
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
          const slot = card.slots.find((s) => s.id === slotId);
          if (slot) slot.props = newProps;
        }
      }
    }
  }

  function cardScope(card: Card) {
    try {
      return buildCardScope(card.slots, {});
    } catch {
      return {};
    }
  }

  function slotState(cardId: string, slotId: string): Record<string, unknown> {
    return readerState[cardId]?.[slotId] ?? {};
  }

  function onSlotState(cardId: string, slotId: string, next: Record<string, unknown>) {
    readerState[cardId] = { ...readerState[cardId], [slotId]: next };
  }

  function cardDone(card: Card): boolean {
    return isCardDone(card.slots, readerState[card.id] ?? {});
  }

  // A slot's prior completable siblings must all be done for a `sequential` slot to appear.
  function priorComplete(card: Card, i: number): boolean {
    for (let j = 0; j < i; j++) {
      const s = card.slots[j];
      const t = getSlot(s.type);
      if (t?.completable && t.isDone && !t.isDone(s.props, slotState(card.id, s.id))) return false;
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
    <h1>{notebook.name}</h1>
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
    {#each notebook.sections as section}
      <section class="section">
        <h2>{section.name}</h2>
        {#each section.cards as card}
          {@const scope = $mode === 'study' ? cardScope(card) : {}}
          {@const done = $mode === 'study' ? cardDone(card) : false}
          <div class="card" class:done>
            {#if $mode === 'study' && done}
              <div class="done-badge">Done</div>
            {/if}
            {#each card.slots as slot, i}
              {@const slotType = getSlot(slot.type)}
              {#if slotType}
                <div class="slot">
                  {#if $mode === 'edit'}
                    <slotType.renderEdit props={slot.props} onUpdate={(p) => updateSlotProps(card.id, slot.id, p)} />
                  {:else}
                    <VerbWrapper
                      verbs={slot.verbs}
                      visible={shouldShow(slot.verbs, scope, priorComplete(card, i))}
                      locked={isLocked(slot.verbs?.locked, scope)}
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
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </section>
    {/each}
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
  header h1 {
    flex: 1;
    font-size: 20px;
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
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    position: relative;
  }
  .card.done {
    border-color: var(--accent, #7c3aed);
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
  .slot {
    margin-bottom: 8px;
  }
  .slot:last-child {
    margin-bottom: 0;
  }
</style>
