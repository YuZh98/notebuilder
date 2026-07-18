<script lang="ts">
  import { svcBarItems, SERVICE_FEATURES, SERVICE_ACTIONS, type ServiceKey } from '../services';
  import { startPointerDrag } from '../drag/engine';
  import { startEdgeResize } from '../drag/resize';
  import { makeSvcDropCallbacks } from '../drag/svc-drop';
  import type { Section } from '../types';

  let {
    section,
    mode,
    view,
    onsearch,
    ontogglearch,
    onrun,
    onreorder,
    onresize,
    onremove,
  }: {
    section: Section;
    mode: 'edit' | 'study';
    /** Live study widgets read this; the bar itself owns no session/notebook state. */
    view: { q: string; showArch: boolean; archivedN: number; flipApplicable: boolean };
    onsearch: (q: string) => void;
    ontogglearch: () => void;
    onrun: (key: ServiceKey) => void;
    /** Edit-mode reorder (from/to index the bar) — owner writes section.svcOrder. */
    onreorder: (from: number, to: number) => void;
    /** Edit-mode width resize commit — owner writes section.svcW[key]. */
    onresize: (key: ServiceKey, w: number) => void;
    /** Dust-drop disables the service — owner clears section.services[key]. */
    onremove: (key: ServiceKey) => void;
  } = $props();

  const DEFS: Record<string, { icon: string; label: string }> = Object.fromEntries(
    [...SERVICE_FEATURES, ...SERVICE_ACTIONS].map((d) => [d.key, d]),
  );

  const editing = $derived(mode === 'edit');
  // flipAll only when some card actually has a flip face (v1 60-stage.js:149).
  const items = $derived(
    svcBarItems(section).filter((k) => k !== 'flipAll' || view.flipApplicable),
  );

  const svcCb = makeSvcDropCallbacks({
    barItems: () => items,
    onreorder: (from, to) => onreorder(from, to),
    onremove: (key) => onremove(key as ServiceKey),
  });

  // Live resize preview stays local; the model is written by the owner on commit.
  let live: { key: string; w: number } | null = $state(null);

  function itemWidth(key: ServiceKey): string | undefined {
    const w = live && live.key === key ? live.w : section.svcW?.[key];
    return typeof w === 'number' ? `width:${w}px` : undefined;
  }

  // The chip grabs the pointerdown so reorder starts and the room-select click never fires.
  function chipDown(ev: PointerEvent, key: ServiceKey) {
    ev.stopPropagation();
    startPointerDrag({ kind: 'svc', id: key, srcEl: ev.currentTarget as HTMLElement }, ev, svcCb);
  }

  // Right-edge handle widens the chip live; commit on release. 40px floor is v2 glue (v1 had none).
  function svcResize(ev: PointerEvent, key: ServiceKey) {
    const item = (ev.currentTarget as HTMLElement).closest<HTMLElement>('.svc-item');
    if (!item) return;
    const startW = item.getBoundingClientRect().width;
    let w = startW;
    startEdgeResize(
      ev,
      (dx) => {
        w = Math.max(40, startW + dx);
        live = { key, w };
      },
      (mv) => {
        live = null;
        if (mv !== null) onresize(key, w);
      },
    );
  }
</script>

{#if items.length}
  <div class="svcbar" data-section={section.id} title={editing ? 'drag to reorder · drag the right edge to widen' : undefined}>
    {#each items as key (key)}
      {#if editing}
        <span
          class="btn sm svc-item"
          data-svcbtn={key}
          style={itemWidth(key)}
          onpointerdown={(e) => chipDown(e, key)}
          >{DEFS[key].icon} {key === 'search' ? 'Search bar' : DEFS[key].label}<span
            class="svcrz"
            role="presentation"
            data-svcrz={key}
            onpointerdown={(e) => svcResize(e, key)}
          ></span></span>
      {:else if key === 'search'}
        <span class="svc-item" style={itemWidth('search')}>
          <input
            class="svc-search"
            data-svcsearch={section.id}
            value={view.q}
            placeholder="🔎 search…"
            oninput={(e) => onsearch(e.currentTarget.value)}
          />
        </span>
      {:else if key === 'archive'}
        <button class="btn sm" class:on={view.showArch} data-svcarch={section.id} style={itemWidth('archive')} onclick={ontogglearch}
          >🗄 {view.archivedN ? `(${view.archivedN}) ` : ''}{view.showArch ? 'Archived' : 'Archive'}</button>
      {:else}
        <button class="btn sm svc-item" data-svcrun={key} style={itemWidth(key)} onclick={() => onrun(key)}
          >{DEFS[key].icon} {DEFS[key].label}</button>
      {/if}
    {/each}
  </div>
{/if}
