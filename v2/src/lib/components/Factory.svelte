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
    setBenchSlotW,
    fuseBenchSlot,
    benchFaceCard,
    type Bench,
    type SlotEffect,
  } from '../bench.svelte';
  import { toast } from '../toast.svelte';
  import { pushGestureSnapshot } from '../drag/gesture-history';
  import { pushHistory } from '../history.svelte';
  import { stateLayerFor } from '../slots/registry';
  import type { Card } from '../types';
  import type { Scope } from '../variable-graph';

  let {
    onseal,
    ongripbench,
    ongripslot,
    confirm = () => Promise.resolve(true),
  }: {
    onseal: (benchId: string) => void;
    ongripbench?: (id: string, ev: PointerEvent, srcEl: HTMLElement) => void;
    ongripslot?: (id: string, ev: PointerEvent, srcEl: HTMLElement) => void;
    confirm?: (message: string, title: string) => Promise<boolean>;
  } = $props();

  // Session-only live preview, keyed by bench id. `prevCards` holds a reactive copy of each
  // bench; `prevState` is the reader channel that choice/list/text-input and reveal-when read;
  // `prevLive` is the session-layer scope bucket (slider). All reset on leaving Preview.
  let prevCards = $state<Record<string, Card>>({});
  let prevState = $state<Record<string, Record<string, Record<string, unknown>>>>({});
  let prevLive = $state<Record<string, Scope>>({});
  // Populate a reactive, discardable clone per bench on entering Preview; clear on leaving so
  // each Preview session starts fresh. Edits to these clones never touch the real bench.
  $effect(() => {
    if (!factory.preview) {
      prevCards = {};
      prevState = {};
      prevLive = {};
      return;
    }
    for (const b of factory.benches) {
      if (!prevCards[b.id]) prevCards[b.id] = benchPreviewCard($state.snapshot(b) as Bench);
    }
  });

  const previewCardFor = (b: Bench): Card =>
    prevCards[b.id] ?? benchPreviewCard($state.snapshot(b) as Bench);

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
      pushHistory();
      setBenchVerb(b, verb, true);
      toast(verb === 'flip' ? 'flip applied — back face created' : 'frameless applied');
    } else if (has(e, 'text/nb-col')) {
      e.preventDefault();
      pushHistory();
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
    const cell = (e.target as HTMLElement).closest?.('[data-sid]') as HTMLElement | null;
    const at = cell?.dataset.sid ? arr.findIndex((s) => s.id === cell.dataset.sid) : -1;
    if (has(e, 'text/nb-sverb')) {
      e.preventDefault();
      e.stopPropagation();
      if (at < 0) {
        toast('drop a slot verb onto a slot');
        return;
      }
      const key = e.dataTransfer!.getData('text/nb-sverb') as SlotEffect;
      pushHistory();
      setSlotVerb(at, key, true);
      factory.sel = at;
      toast('effect applied');
    } else if (has(e, 'text/nb-slot')) {
      e.preventDefault();
      e.stopPropagation();
      pushHistory();
      addBenchSlot(b, e.dataTransfer!.getData('text/nb-slot'), back ? 'back' : undefined, at >= 0 ? at : undefined);
    }
  }

  // Click a bench slot to select it (v1 selslot); a bare-container click clears the selection.
  function benchClick(e: MouseEvent, b: Bench) {
    // Let interactive controls (e.g. the inline slot ✕) run without a stale selection.
    if ((e.target as HTMLElement).closest('button, input, textarea, select, [contenteditable]')) return;
    const arr = factory.face === 'back' ? (b.back ?? []) : b.slots;
    const cell = (e.target as HTMLElement).closest?.('[data-sid]') as HTMLElement | null;
    if (cell?.dataset.sid) {
      factory.sel = arr.findIndex((s) => s.id === cell.dataset.sid);
    } else {
      factory.sel = null;
    }
  }

  // The bench-head grip drags the whole container to reorder it (v1 90:99).
  function benchDown(e: PointerEvent, b: Bench) {
    const card = (e.target as HTMLElement).closest('.faccard') as HTMLElement | null;
    if (card) ongripbench?.(b.id, e, card);
  }

  // Press on a slot cell (not an inner control or the fuse-resize gutter) starts a slot reorder
  // within the active face (v1 90:100).
  function benchSlotDown(e: PointerEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('button, input, textarea, select, [contenteditable], [data-fusegut]')) return;
    const cell = t.closest?.('[data-sid]') as HTMLElement | null;
    if (cell?.dataset.sid) ongripslot?.(cell.dataset.sid, e, cell);
  }

  // ✕ and dustbin-drag now share one path: confirm, then delBench (keeps one fresh bench).
  function removeBench(id: string) {
    void confirm('Delete this container? (sealed products stay in Inventory. Undoable.)', 'Delete Container').then((ok) => {
      if (!ok) return;
      pushGestureSnapshot();
      delBench(id);
    });
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
  // `preview` hands the study card a reactive, session-only copy; the collapsed thumbnail
  // gets a frozen snapshot.
  function benchProps(b: Bench, editable: boolean, preview = false) {
    const card = editable
      ? benchFaceCard(b, factory.face === 'back')
      : preview
        ? previewCardFor(b)
        : benchPreviewCard($state.snapshot(b) as Bench);
    // Highlight the selected slot on the editable active bench; null on previews/collapsed cards.
    const face = factory.face === 'back' ? (b.back ?? []) : b.slots;
    const selectedSlotId = editable && factory.sel != null ? (face[factory.sel]?.id ?? null) : null;
    return {
      card,
      surface: editable ? 'bench' as const : 'read' as const,
      selected: false,
      selectedSlotId,
      state: editable ? {} : (prevState[b.id] ?? {}),
      live: preview ? (prevLive[b.id] ?? {}) : {},
      notes: [],
      notesOpen: false,
      onselect: noop,
      onstate: editable
        ? noop
        : (slotId: string, next: Record<string, unknown>) => {
            if (stateLayerFor(card, slotId) === 'session') {
              prevLive[b.id] = { ...prevLive[b.id], ...(next as Scope) };
            } else {
              prevState[b.id] = { ...prevState[b.id], [slotId]: next };
            }
          },
      onmove: noop,
      ondelete: noop,
      onverb: editable
        ? (key: 'flip' | 'bare', on: boolean) => {
            pushHistory();
            setBenchVerb(b, key, on);
          }
        : noop,
      ontags: noop,
      onsavetype: noop,
      onupdateslot: editable
        ? (slotId: string, props: Record<string, unknown>) => updateBenchSlot(b, slotId, props)
        : noop,
      onslotresize: editable ? (slotId: string, w: number) => setBenchSlotW(b, slotId, w) : noop,
      ondeleteslot: editable
        ? (slotId: string) => {
            pushHistory();
            deleteBenchSlot(b, slotId);
          }
        : noop,
      onaddslot: editable
        ? (type: string, face?: 'back') => {
            pushHistory();
            addBenchSlot(b, type, face ?? (factory.face === 'back' ? 'back' : undefined));
          }
        : noop,
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
          <CardView {...benchProps(b, false, true)} forceMode="study" />
          <div class="sm muted bench-caption">{b.name}</div>
        </div>
      {:else if b.id === factory.active}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <!-- Capture phase on the whole container, not just the slot grid: v1's `selbench` sits on
             `.benchcard`, so clicking the head, note or face chips also deselects (60-stage.js:18). -->
        <div
          class="benchcard faccard on"
          style="--w:6"
          data-bench={b.id}
          ondragover={faccardOver}
          ondrop={(e) => faccardDrop(e, b)}
          onclickcapture={(e) => benchClick(e, b)}
        >
          <div class="row bench-head">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="grip" role="presentation" onpointerdown={(e) => benchDown(e, b)}>⋮⋮</span>
            <span class="bench-name-wrap" data-history="edit">
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
              onclick={() => {
                pushHistory();
                dupBench(b.id);
              }}>⎘ Duplicate</button>
            <button class="btn sm" title="Seal a copy into the Inventory" onclick={() => onseal(b.id)}
              >🔒 Seal</button>
            <button class="btn sm warn" title="Delete this container" onclick={() => removeBench(b.id)}
              >✕</button>
          </div>
          <span data-history="edit" style="display:contents">
            <CeText
              value={b.note ?? ''}
              onchange={(v) => setNote(b, v)}
              placeholder="note — shipped with the product (optional · $math$)"
              viewClass="ce-sub"
              editClass="ce-sub"
            />
          </span>
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
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="bench bench-grid"
            ondragover={benchOver}
            ondrop={(e) => benchDrop(e, b)}
            onpointerdowncapture={benchSlotDown}
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
          onpointerdown={(e) => ongripbench?.(b.id, e, e.currentTarget)}
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
