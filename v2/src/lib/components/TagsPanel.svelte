<script lang="ts">
  let {
    tags,
    cardTags = null,
    ontoggle,
    onrename,
    ondelete,
    onadd,
    ongrip,
  }: {
    /** Derived notebook-wide tag list — there is no registry (D21). */
    tags: string[];
    /** Selected card's tags, or null when no card is selected (gates click-to-tag). */
    cardTags?: string[] | null;
    ontoggle: (tag: string) => void;
    onrename: (old: string, next: string) => void;
    ondelete: (tag: string) => void;
    onadd: (tag: string) => void;
    ongrip: (tag: string, ev: PointerEvent, srcEl: HTMLElement) => void;
  } = $props();

  let folded = $state(false);
  let draft = $state('');

  const isControl = (e: Event) =>
    e.target instanceof Element && e.target.closest('input, button') !== null;

  function chipClick(e: MouseEvent, tag: string) {
    if (isControl(e) || cardTags === null) return;
    ontoggle(tag);
  }

  function chipGrip(e: PointerEvent, tag: string) {
    if (isControl(e)) return;
    ongrip(tag, e, e.currentTarget as HTMLElement);
  }

  function commitRename(e: Event, old: string) {
    const el = e.currentTarget as HTMLInputElement;
    const next = el.value.trim();
    if (next && next !== old) onrename(old, next);
    else el.value = old;
  }

  function add() {
    const v = draft.trim();
    if (!v) return;
    onadd(v);
    draft = '';
  }
</script>

<div class="store-lane tags-panel">
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <h4
    style="cursor:pointer"
    role="button"
    tabindex="0"
    title="Notebook tags — click a tag to tag the selected card; rename/delete updates every card."
    onclick={() => (folded = !folded)}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        folded = !folded;
      }
    }}
  >
    {folded ? '▸' : '▾'} 🏷 Tags <span class="muted sm">{tags.length}</span>
  </h4>
  {#if !folded}
    {#if tags.length > 0}
      <div class="palette tag-grid" style="margin:var(--space-3) 0">
        {#each tags as tag (tag)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <span
            class="chip prodchip tagchip"
            class:on={cardTags?.includes(tag)}
            data-tag={tag}
            data-tagreorder={tag}
            title={(cardTags ? 'click to tag the selected card · ' : '') +
              'drag onto a card or along the bar · type to rename'}
            onclick={(e) => chipClick(e, tag)}
            onpointerdown={(e) => chipGrip(e, tag)}
          >🏷<input
              class="taginput"
              value={tag}
              size={Math.max(tag.length, 3)}
              disabled={tag === 'pinned'}
              title={tag === 'pinned'
                ? '“pinned” is maintained by the 📍 pin button and can’t be renamed'
                : 'type to rename everywhere'}
              onchange={(e) => commitRename(e, tag)}
            /><button
              class="tagx"
              title="delete this tag everywhere"
              onclick={() => ondelete(tag)}>✕</button>
          </span>
        {/each}
      </div>
    {:else}
      <div class="muted sm" style="margin:var(--space-3) 0">none yet</div>
    {/if}
    <div class="row tag-add">
      <input
        placeholder="new tag…"
        bind:value={draft}
        onkeydown={(e) => {
          if (e.key === 'Enter') add();
        }}
      />
      <button class="btn sm" title="Create a tag — drag or click it onto cards afterwards" onclick={add}>＋</button>
    </div>
  {/if}
</div>

<style>
  .tagchip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    cursor: grab;
  }
  .taginput {
    background: transparent;
    border: none;
    color: inherit;
    font-size: var(--fs-sm);
    width: auto;
    padding: 0 var(--space-1);
  }
  .taginput:disabled {
    opacity: 0.7;
  }
  .tagx {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: var(--fs-2xs);
    opacity: 0.5;
    padding: 0 var(--space-1);
  }
  .tagx:hover {
    opacity: 1;
  }
  .tag-add {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .tag-add input {
    flex: 1;
    min-width: 0;
  }
</style>
