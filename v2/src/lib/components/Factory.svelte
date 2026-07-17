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
    deleteBenchSlot,
    updateBenchSlot,
    fuseBenchSlot,
    type Bench,
  } from '../bench.svelte';

  let { onseal }: { onseal: (benchId: string) => void } = $props();

  // Self-heal to a valid active bench before the first render (v1 rebuildRefs).
  activeBench();

  const noop = () => {};

  function selectBench(id: string) {
    factory.active = id;
    factory.sel = null;
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
        <div class="benchcard faccard on" style="--w:6" data-bench={b.id}>
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
          <div class="bench">
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
