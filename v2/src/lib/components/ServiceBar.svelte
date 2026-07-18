<script lang="ts">
  import { svcBarItems, SERVICE_FEATURES, SERVICE_ACTIONS, type ServiceKey } from '../services';
  import type { Section } from '../types';

  let {
    section,
    mode,
    state,
    onsearch,
    ontogglearch,
    onrun,
  }: {
    section: Section;
    mode: 'edit' | 'study';
    /** Live study widgets read this; the bar itself owns no session/notebook state. */
    state: { q: string; showArch: boolean; archivedN: number; flipApplicable: boolean };
    onsearch: (q: string) => void;
    ontogglearch: () => void;
    onrun: (key: ServiceKey) => void;
  } = $props();

  const DEFS: Record<string, { icon: string; label: string }> = Object.fromEntries(
    [...SERVICE_FEATURES, ...SERVICE_ACTIONS].map((d) => [d.key, d]),
  );

  const editing = $derived(mode === 'edit');
  // flipAll only when some card actually has a flip face (v1 60-stage.js:149).
  const items = $derived(
    svcBarItems(section).filter((k) => k !== 'flipAll' || state.flipApplicable),
  );
</script>

{#if items.length}
  <div class="svcbar" data-section={section.id}>
    {#each items as key (key)}
      {#if editing}
        <span class="btn sm svc-item" draggable="true" data-svcbtn={key}
          >{DEFS[key].icon} {key === 'search' ? 'Search bar' : DEFS[key].label}</span>
      {:else if key === 'search'}
        <span class="svc-item">
          <input
            class="svc-search"
            data-svcsearch={section.id}
            value={state.q}
            placeholder="🔎 search…"
            oninput={(e) => onsearch(e.currentTarget.value)}
          />
        </span>
      {:else if key === 'archive'}
        <button class="btn sm" class:on={state.showArch} data-svcarch={section.id} onclick={ontogglearch}
          >🗄 {state.archivedN ? `(${state.archivedN}) ` : ''}{state.showArch ? 'Archived' : 'Archive'}</button>
      {:else}
        <button class="btn sm svc-item" data-svcrun={key} onclick={() => onrun(key)}
          >{DEFS[key].icon} {DEFS[key].label}</button>
      {/if}
    {/each}
  </div>
{/if}
