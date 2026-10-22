<script lang="ts">
  import SlotConfig from './SlotConfig.svelte';
  import { allSlots } from '../slots/registry';
  import { toast } from '../toast.svelte';
  import {
    factory,
    activeBench,
    currentBench,
    freshBench,
    addBench,
    addBenchSlot,
    setBenchVerb,
    setSlotVerb,
    deleteBenchSlot,
    fuseBenchSlot,
    typeToBench,
    type SlotEffect,
  } from '../bench.svelte';
  import { VAR } from '../var-colors';
  import { pushHistory } from '../history.svelte';
  import { STORES, prodIcon, type CardType } from '../card-types';
  import type { Slot } from '../types';

  let {
    cardTypes = [],
    ondelprod = () => {},
    ongrip,
  }: {
    cardTypes?: CardType[];
    ondelprod?: (ct: CardType) => void;
    ongrip?: (id: string, ev: PointerEvent, srcEl: HTMLElement) => void;
  } = $props();

  // Workshop (store:null) first, then the three stores — mirrors v1 inventory order (50-render:239).
  const invLanes = [{ id: null as string | null, name: '🛠 Workshop' }, ...STORES];
  let invFold = $state<Record<string, boolean>>({});
  const invKey = (id: string | null) => id ?? '';
  const invItems = (id: string | null) =>
    cardTypes.filter((t) => (id ? (t.store || null) === id : !t.store));

  function fork(ct: CardType) {
    // v1 loadprod (70-events:139): copy into a fresh bench and stay in the Factory.
    pushHistory();
    addBench(typeToBench($state.snapshot(ct) as CardType));
    toast(`copied "${ct.name}" — edit freely, then seal`);
  }

  const CVERBS = [
    { key: 'flip', icon: '⟳', label: 'Flip' },
    { key: 'bare', icon: '▢', label: 'Frameless' },
  ] as const;

  // Icons match the bench-slot flags CardView draws once an effect is on.
  const SVERBS = [
    { key: 'reveal', icon: '👁', label: 'Reveal-when', tip: 'Show only while a condition on a card variable holds' },
    { key: 'glow', icon: '✦', label: 'Glow', tip: 'Draw attention with a glow' },
    { key: 'emphasis', icon: '❝', label: 'Emphasis', tip: 'Render as an emphasized callout' },
    { key: 'sequential', icon: '⏭', label: 'Step-by-step', tip: 'Hide until the earlier tasks on this card are done' },
  ] as const satisfies readonly { key: SlotEffect; icon: string; label: string; tip: string }[];

  // Self-heal to a valid active bench once at init (before deriveds read it), so the
  // pure `currentBench` reader below never has to mutate during render (v1 rebuildRefs).
  activeBench();

  const b = $derived(currentBench() ?? freshBench());
  const faceSlots = $derived(factory.face === 'back' ? (b.back ?? []) : b.slots);
  const selSlot = $derived(factory.sel != null ? faceSlots[factory.sel] : undefined);
  const revKeys = $derived([
    ...new Set(faceSlots.filter((s) => s.props?.key).map((s) => String(s.props.key))),
  ]);

  function drag(e: DragEvent, kind: string, value: string) {
    e.dataTransfer?.setData(kind, value);
  }

  function addSlot(type: string) {
    pushHistory();
    addBenchSlot(b, type, factory.face === 'back' ? 'back' : undefined);
  }

  function effect(key: SlotEffect) {
    if (factory.sel == null) {
      toast('select a slot first — click it on the bench');
      return;
    }
    pushHistory();
    setSlotVerb(factory.sel, key, !selSlot?.verbs?.[key]);
  }

  function setColor(accent: string) {
    pushHistory();
    b.accent = accent || undefined;
  }

  function patchSlot(patch: Partial<Slot>) {
    const s = selSlot;
    if (!s || factory.sel == null) return;
    if ('verbs' in patch) s.verbs = patch.verbs;
    const nx = faceSlots[factory.sel + 1];
    if ('fuse' in patch) {
      s.fuse = patch.fuse;
      if (patch.fuse && nx) fuseBenchSlot(b, s.id, nx.id, s.fuseW ?? 1, nx.fuseW ?? 1);
    }
    if ('fuseW' in patch && nx) {
      const total = (s.fuseW ?? 1) + (nx.fuseW ?? 1);
      const rightW = Math.round((total - patch.fuseW!) * 100) / 100;
      fuseBenchSlot(b, s.id, nx.id, patch.fuseW!, rightW);
    }
  }

  function delSlot() {
    if (!selSlot) return;
    pushHistory();
    deleteBenchSlot(b, selSlot.id);
    factory.sel = null;
  }
</script>

<div id="side">
  <div class="store-lane">
    <h4 title="Click or drag a slot into the container.">➕ Slots</h4>
    <div class="palette">
      {#each allSlots() as t (t.type)}
        <button
          class="chip"
          draggable="true"
          ondragstart={(e) => drag(e, 'text/nb-slot', t.type)}
          onclick={() => addSlot(t.type)}
          title={`Add a ${t.type} slot`}>{t.type}</button>
      {/each}
    </div>
  </div>

  <div class="store-lane">
    <h4 title="The card's shape — applies to the whole container.">▣ Card mode</h4>
    <div class="palette">
      {#each CVERBS as v (v.key)}
        <button
          class="chip"
          class:on={b.verbs?.[v.key]}
          draggable="true"
          ondragstart={(e) => drag(e, 'text/nb-verb', v.key)}
          onclick={() => {
            pushHistory();
            setBenchVerb(b, v.key, !b.verbs?.[v.key]);
          }}>{v.icon} {v.label}</button>
      {/each}
    </div>
  </div>

  <div class="store-lane">
    <h4 title="Per-slot effects — click to apply to the selected slot, or drag onto any slot.">
      ✦ Slot effects
    </h4>
    <div class="palette">
      {#each SVERBS as v (v.key)}
        <button
          class="chip"
          class:on={!!selSlot?.verbs?.[v.key]}
          draggable="true"
          ondragstart={(e) => drag(e, 'text/nb-sverb', v.key)}
          title={v.tip}
          onclick={() => effect(v.key)}>{v.icon} {v.label}</button>
      {/each}
    </div>
  </div>

  <div class="store-lane">
    <h4 title="One look per product — drag a swatch onto the card.">🎨 Colors</h4>
    <div class="palette">
      {#each VAR as v (v.name)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <span
          class="swatch"
          class:on={(b.accent || '') === v.accent}
          draggable="true"
          ondragstart={(e) => drag(e, 'text/nb-col', v.accent)}
          onclick={() => setColor(v.accent)}
          style="background:{v.accent || 'var(--accent)'}"
          title={v.name}
        ></span>
      {/each}
      <input
        type="color"
        value={b.accent || '#6ea8fe'}
        title="custom colour"
        style="width:26px;height:26px;padding:0;border-radius:var(--radius-md); /* token-exempt: 26px square sizes the native colour swatch */"
        onchange={(e) => setColor(e.currentTarget.value)}
      />
    </div>
  </div>

  {#if selSlot}
    <SlotConfig
      slot={selSlot}
      {revKeys}
      hasNext={factory.sel != null && !!faceSlots[factory.sel + 1]}
      nextFuseW={(factory.sel != null ? faceSlots[factory.sel + 1]?.fuseW : undefined) ?? 1}
      onpatch={patchSlot}
      ondelete={delSlot}
    />
  {/if}

  {#if factory.sel == null}
    <div class="sect">
      <h3 title="Drag a product to reorder · between lanes to move its store · onto the bench to fork a copy. Click to edit it.">📦 Inventory</h3>
      {#each invLanes as lane (invKey(lane.id))}
        {@const items = invItems(lane.id)}
        <div class="store-lane" data-lane={invKey(lane.id)}>
          <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
          <h4
            style="cursor:pointer"
            title="collapse / expand"
            role="button"
            tabindex="0"
            onclick={() => (invFold[invKey(lane.id)] = !invFold[invKey(lane.id)])}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                invFold[invKey(lane.id)] = !invFold[invKey(lane.id)];
              }
            }}
          >
            {invFold[invKey(lane.id)] ? '▸' : '▾'}
            {lane.name}
            <span class="muted sm">{items.length}</span>
          </h4>
          {#if !invFold[invKey(lane.id)]}
            {#if !items.length}
              <div class="muted sm">—</div>
            {:else}
              <div class="palette">
                {#each items as ct (ct.id)}
                  <span class="prodchip-wrap">
                    <button
                      class="chip prodchip"
                      data-prod={ct.id}
                      title={`${ct.name} — click to copy into a new container · drag to reorder/move`}
                      onpointerdown={(e) => ongrip?.(ct.id, e, e.currentTarget)}
                      onclick={() => fork(ct)}>{prodIcon(ct)} {ct.name}</button>
                    <button
                      class="chipx"
                      title="delete product"
                      onclick={() => ondelprod(ct)}>✕</button>
                  </span>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
