<script lang="ts">
  import type { Snippet } from 'svelte';
  import { mode } from '../stores/mode';
  import { renderMarkdown } from '../markdown';
  import { sectionsOfChapter } from '../notebook-ops';
  import CeText from './CeText.svelte';
  import type { Notebook, Section, Card } from '../types';

  let {
    section,
    notebook,
    visibleCardIds,
    selected,
    onselect,
    onpatch,
    collapsed,
    ontogglecollapse,
    cardView,
    sectionTools,
    sectionFooter,
  }: {
    section: Section;
    notebook: Notebook;
    visibleCardIds: Set<string> | null;
    selected: boolean;
    onselect: () => void;
    /** Section field updates go through the notebook owner (undefined deletes the key). */
    onpatch: (patch: Partial<Section>) => void;
    /** Study-only per-section collapse — session state owned by Stage, never persisted. */
    collapsed: boolean;
    ontogglecollapse: () => void;
    cardView: Snippet<[Section, Card, boolean]>;
    sectionTools?: Snippet<[Section]>;
    sectionFooter?: Snippet<[Section]>;
  } = $props();

  const studying = $derived($mode === 'study');
  const editable = $derived(!studying && section.locked !== true);
  const title = $derived((section.title ?? '').trim());
  const subtitle = $derived((section.subtitle ?? '').trim());
  const cards = $derived(
    !studying || visibleCardIds === null
      ? section.cards
      : section.cards.filter((c) => visibleCardIds.has(c.id)),
  );
  const chapterCount = $derived(
    section.kind === 'divider' ? sectionsOfChapter(notebook, section.id).length : 0,
  );
  const widthStyle = $derived(
    typeof section.width === 'number' && section.width > 0
      ? `width:${section.width}px;max-width:100%`
      : undefined,
  );

  function select() {
    if (!studying) onselect();
  }

  function toggleFold() {
    onpatch({ folded: section.folded ? undefined : true });
  }

  function toggleLock() {
    onpatch({ locked: section.locked ? undefined : true });
  }

  function setTitle(v: string) {
    onpatch({ title: v.trim() ? v : undefined });
  }

  function setSubtitle(v: string) {
    onpatch({ subtitle: v.trim() ? v : undefined });
  }

  function chevKeydown(e: KeyboardEvent, toggle: () => void) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  }
</script>

{#snippet staticTitles(withMeta: boolean)}
  <div class="room-title">
    {#if title}{@html renderMarkdown(title)}{:else}<span class="muted sm">{section.name}</span>{/if}
  </div>
  {#if subtitle}<div class="room-sub">{@html renderMarkdown(subtitle)}</div>{/if}
  {#if withMeta}<div class="room-meta muted sm">🔒 locked</div>{/if}
{/snippet}

{#snippet editTitles()}
  <CeText
    value={section.title ?? ''}
    multiline={false}
    placeholder="room title (optional · ## = heading · $math$)"
    viewClass="room-title"
    editClass="ce-title"
    onchange={setTitle}
  />
  <CeText
    value={section.subtitle ?? ''}
    placeholder="subtitle (optional)"
    viewClass="room-sub"
    editClass="ce-sub"
    onchange={setSubtitle}
  />
{/snippet}

{#if section.kind === 'divider'}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="room divider {studying ? 'study' : 'edit'}"
    class:sel={selected && !studying}
    data-section={section.id}
    onclick={select}
  >
    {#if !studying && sectionTools}{@render sectionTools(section)}{/if}
    <div class="row" style="align-items:flex-start;gap:6px">
      <span
        class="rcollapse"
        role="button"
        tabindex="0"
        title={section.folded ? 'expand chapter' : 'collapse chapter'}
        onclick={(e) => {
          e.stopPropagation();
          toggleFold();
        }}
        onkeydown={(e) => chevKeydown(e, toggleFold)}
      >{section.folded ? '▸' : '▾'}</span>
      <span style="flex:1">
        {#if studying}
          {#if title}<span class="room-title">{@html renderMarkdown(title)}</span>{:else}<span
              class="muted sm">{section.name}</span>{/if}
        {:else}
          {@render editTitles()}
        {/if}
      </span>
      {#if section.folded && chapterCount > 0}
        <span class="muted sm">{chapterCount} section{chapterCount > 1 ? 's' : ''}</span>
      {/if}
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="room {studying ? 'study' : 'edit'}"
    class:sel={selected && !studying}
    data-section={section.id}
    style={widthStyle}
    onclick={select}
  >
    {#if !studying && sectionTools}{@render sectionTools(section)}{/if}
    {#if !studying}
      <button
        class="room-lock"
        class:on={section.locked}
        title={section.locked ? 'locked — click to unlock' : 'unlocked — click to lock'}
        onclick={(e) => {
          e.stopPropagation();
          toggleLock();
        }}
      >{section.locked ? '🔒' : '🔓'}</button>
    {/if}
    <div class="room-bar">
      {#if studying}
        <div class="room-title">
          <span
            class="rcollapse"
            role="button"
            tabindex="0"
            title={collapsed ? 'expand' : 'collapse'}
            onclick={(e) => {
              e.stopPropagation();
              ontogglecollapse();
            }}
            onkeydown={(e) => chevKeydown(e, ontogglecollapse)}
          >{collapsed ? '▸' : '▾'}</span>
          {#if title}{@html renderMarkdown(title)}{:else}<span class="muted sm">{section.name}</span>{/if}
        </div>
        {#if subtitle && !collapsed}<div class="room-sub">{@html renderMarkdown(subtitle)}</div>{/if}
      {:else if section.locked}
        {@render staticTitles(true)}
      {:else}
        {@render editTitles()}
      {/if}
    </div>
    {#if !(studying && collapsed)}
      <div class="rgwrap">
        <div class="grid room-grid" data-section={section.id} style="flex:1 1 auto">
          {#if cards.length === 0 && !studying}
            <div class="empty" style="flex:1 0 100%">
              {section.locked
                ? 'locked'
                : 'Empty — drag a product here from the Store, or click a product → Place.'}
            </div>
          {/if}
          {#each cards as card (card.id)}
            {@render cardView(section, card, editable)}
          {/each}
        </div>
      </div>
      {#if editable && sectionFooter}{@render sectionFooter(section)}{/if}
    {/if}
  </div>
{/if}
