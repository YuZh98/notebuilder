<script lang="ts">
  import CardView from './CardView.svelte';
  import CeText from './CeText.svelte';
  import {
    factory,
    activeBench,
    dupBench,
    delBench,
    benchPreviewCard,
    setBenchVerb,
    addBenchSlot,
    setSlotVerb,
    deleteBenchSlot,
    updateBenchSlot,
    fuseBenchSlot,
    type Bench,
  } from '../bench.svelte';
  import { toast } from '../toast.svelte';

  let { onseal }: { onseal: (benchId: string) => void } = $props();

  // Self-heal to a valid active bench before the first render (v1 rebuildRefs).
  activeBench();

  const noop = () => {};

  function selectBench(id: string) {
    factory.active = id;
    factory.sel = null;
  }

  const has = (e: DragEvent, kind: string) => (e.dataTransfer?.types ?? []).includes(kind);

  // Decorator drops onto the container: card-mode verbs and the product colour (v1 130-boot:11-12).
  function faccardOver(e: DragEvent) {
    if (has(e, 'text/nb-verb') || has(e, 'text/nb-col')) e.preventDefault();
  }
  function faccardDrop(e: DragEvent, b: Bench) {
    if (has(e, 'text/nb-verb')) {
      e.preventDefault();
      const verb = e.dataTransfer!.getData('text/nb-verb') as 'flip' | 'bare';
      setBenchVerb(b, verb, true);
      toast(verb === 'flip' ? 'flip applied — back face created' : 'frameless applied');
    } else if (has(e, 'text/nb-col')) {
      e.preventDefault();
      b.accent = e.dataTransfer!.getData('text/nb-col') || undefined;
      toast('look applied');
    }
  }

  // Decorator drops onto the slot grid: add a slot (nb-slot) or apply a slot effect (nb-sverb).
  function benchOver(e: DragEvent) {
    if (has(e, 'text/nb-slot') || has(e, 'text/nb-sverb')) e.preventDefault();
  }
  function benchDrop(e: DragEvent, b: Bench) {
    const back = factory.face === 'back';
    const arr = back ? (b.back ?? []) : b.slots;
    const cell = (e.target as HTMLElement).closest?.('.cardslot') as HTMLElement | null;
    const at = cell?.dataset.sid ? arr.findIndex((s) => s.id === cell.dataset.sid) : -1;
    if (has(e, 'text/nb-sverb')) {
      e.preventDefault();
      e.stopPropagation();
      if (at < 0) {
        toast('drop a slot verb onto a slot');
        return;
      }
      const key = e.dataTransfer!.getData('text/nb-sverb') as 'reveal' | 'glow' | 'emphasis';
      setSlotVerb(at, key, true);
      factory.sel = at;
      toast('effect applied');
    } else if (has(e, 'text/nb-slot')) {
      e.preventDefault();
      e.stopPropagation();
      addBenchSlot(b, e.dataTransfer!.getData('text/nb-slot'), back ? 'back' : undefined, at >= 0 ? at : undefined);
    }
  }

  // Click a bench slot to select it (v1 selslot); a bare-container click clears the selection.
  function benchClick(e: MouseEvent, b: Bench) {
    const arr = factory.face === 'back' ? (b.back ?? []) : b.slots;
    const cell = (e.target as HTMLElement).closest?.('.cardslot') as HTMLElement | null;
    if (cell?.dataset.sid) {
      factory.sel = arr.findIndex((s) => s.id === cell.dataset.sid);
    } else if (e.target === e.currentTarget) {
      factory.sel = null;
    }
  }

  function renameBench(b: Bench, v: string) {
    const t = v.trim();
    if (t) b.name = t;
  }

  function setNote(b: Bench, v: string) {
    const t = v.trim();
    if (t) b.note = t;
    else delete b.note;
  }

  // Shared CardView props: notebook-specific callbacks are no-ops; slot edits write the bench.
  function benchProps(b: Bench, editable: boolean) {
    const card = editable ? benchPreviewCard(b) : benchPreviewCard($state.snapshot(b) as Bench);
    return {
      card,
      editable,
      selected: false,
      state: {},
      notes: [],
      notesOpen: false,
      onselect: noop,
      onstate: noop,
      onmove: noop,
      ondelete: noop,
      onverb: editable ? (key: 'flip' | 'bare', on: boolean) => setBenchVerb(b, key, on) : noop,
      ontags: noop,
      onsavetype: noop,
      onupdateslot: editable
        ? (slotId: string, props: Record<string, unknown>) => updateBenchSlot(b, slotId, props)
        : noop,
      ondeleteslot: editable ? (slotId: string) => deleteBenchSlot(b, slotId) : noop,
      onaddslot: editable ? (type: string, face?: 'back') => addBenchSlot(b, type, face) : noop,
      progresscompletion: () => ({ done: 0, total: 0, pct: 0 }),
      ontogglenotes: noop,
      onaddnote: noop,
      ondeletenote: noop,
      ongrip: noop,
      onresize: noop,
      onfusew: editable
        ? (l: string, r: string, lw: number, rw: number) => fuseBenchSlot(b, l, r, lw, rw)
        : noop,
    };
  }
</script>

<div class="card-shell">
  <div class="row"><h2 style="margin:0">🏭 Factory</h2></div>
  <div class="grid fac-grid">
    {#each factory.benches as b (b.id)}
      {#if factory.preview}
        <div class="benchprev" data-benchprev={b.id}>
          <CardView {...benchProps(b, false)} forceMode="study" />
          <div class="sm muted bench-caption">{b.name}</div>
        </div>
      {:else if b.id === factory.active}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="benchcard faccard on"
          style="--w:6"
          data-bench={b.id}
          ondragover={faccardOver}
          ondrop={(e) => faccardDrop(e, b)}
        >
          <div class="row bench-head">
            <span class="grip">⋮⋮</span>
            <span class="bench-name-wrap">
              <CeText
                value={b.name}
                onchange={(v) => renameBench(b, v)}
                multiline={false}
                placeholder="product name · Base--Variety"
              />
            </span>
            <button
              class="btn sm"
              title="Duplicate this container (great for making a variety)"
              onclick={() => dupBench(b.id)}>⎘ Duplicate</button>
            <button class="btn sm" title="Seal a copy into the Inventory" onclick={() => onseal(b.id)}
              >🔒 Seal</button>
            <button class="btn sm warn" title="Delete this container" onclick={() => delBench(b.id)}
              >✕</button>
          </div>
          <CeText
            value={b.note ?? ''}
            onchange={(v) => setNote(b, v)}
            placeholder="note — shipped with the product (optional · $math$)"
            viewClass="ce-sub"
            editClass="ce-sub"
          />
          {#if b.verbs?.flip}
            <div class="palette bench-faces">
              <button
                class="chip sm"
                class:on={factory.face !== 'back'}
                onclick={() => (factory.face = 'front')}>Front</button>
              <button
                class="chip sm"
                class:on={factory.face === 'back'}
                onclick={() => (factory.face = 'back')}>Back</button>
            </div>
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <!-- Capture phase: CardView's editable click handler stops bubbling, so intercept on the way down. -->
          <div
            class="bench bench-grid"
            ondragover={benchOver}
            ondrop={(e) => benchDrop(e, b)}
            onclickcapture={(e) => benchClick(e, b)}
          >
            <CardView {...benchProps(b, true)} />
          </div>
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="benchcard faccard"
          style="--w:6"
          data-bench={b.id}
          role="button"
          tabindex="0"
          title="Edit this container"
          onclick={() => selectBench(b.id)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectBench(b.id);
            }
          }}
        >
          <div class="prod pv">
            <CardView {...benchProps(b, false)} />
          </div>
          <div class="sm muted bench-caption">{b.name}</div>
        </div>
      {/if}
    {/each}
  </div>
</div>
