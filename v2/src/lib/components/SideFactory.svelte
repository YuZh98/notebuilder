<script lang="ts">
  import SlotConfig from './SlotConfig.svelte';
  import { allSlots } from '../slots/registry';
  import { toast } from '../toast.svelte';
  import {
    factory,
    activeBench,
    addBenchSlot,
    setBenchVerb,
    setSlotVerb,
    deleteBenchSlot,
    fuseBenchSlot,
  } from '../bench.svelte';
  import { VAR } from '../var-colors';
  import type { Slot } from '../types';

  const CVERBS = [
    { key: 'flip', icon: '⟳', label: 'Flip' },
    { key: 'bare', icon: '▢', label: 'Frameless' },
  ] as const;

  const SVERBS = [
    { key: 'reveal', icon: '👁', label: 'Reveal-when' },
    { key: 'glow', icon: '✦', label: 'Glow' },
    { key: 'emphasis', icon: '❝', label: 'Emphasis' },
  ] as const;

  const b = $derived(activeBench());
  const faceSlots = $derived(factory.face === 'back' ? (b.back ?? []) : b.slots);
  const selSlot = $derived(factory.sel != null ? faceSlots[factory.sel] : undefined);
  const revKeys = $derived([
    ...new Set(faceSlots.filter((s) => s.props?.key).map((s) => String(s.props.key))),
  ]);

  function drag(e: DragEvent, kind: string, value: string) {
    e.dataTransfer?.setData(kind, value);
  }

  function addSlot(type: string) {
    addBenchSlot(b, type, factory.face === 'back' ? 'back' : undefined);
  }

  function effect(key: 'reveal' | 'glow' | 'emphasis') {
    if (factory.sel == null) {
      toast('select a slot first — click it on the bench');
      return;
    }
    setSlotVerb(factory.sel, key, !selSlot?.verbs?.[key]);
  }

  function setColor(accent: string) {
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
          onclick={() => setBenchVerb(b, v.key, !b.verbs?.[v.key])}>{v.icon} {v.label}</button>
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
        style="width:26px;height:26px;padding:0;border-radius:6px"
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
</div>
