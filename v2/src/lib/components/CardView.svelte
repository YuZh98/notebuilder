<script lang="ts">
  import { mode } from '../stores/mode';
  import { getSlot, allSlots } from '../slots/registry';
  import { buildCardScope } from '../card-scope';
  import { isCardDone, CARD_STATE_KEY } from '../card-done';
  import { shouldShow, isLocked } from '../verbs';
  import { startEdgeResize } from '../drag/resize';
  import { clampCardW, fuseSplit } from '../drag/geometry';
  import { pushGestureSnapshot } from '../drag/gesture-history';
  import VerbWrapper from '../slots/VerbWrapper.svelte';
  import ProgressStudy from '../slots/ProgressStudy.svelte';
  import CardNotes from './CardNotes.svelte';
  import type { ProgressProps } from '../slots/progress';
  import type { Annotation, Card, Slot, SlotProps } from '../types';

  let {
    card,
    editable,
    selected,
    selectedSlotId,
    // `state` is the external prop name; aliased so it cannot shadow the $state rune.
    state: cardState,
    notes,
    notesOpen,
    onselect,
    onstate,
    onmove,
    ondelete,
    onverb,
    ontags,
    onsavetype,
    onupdateslot,
    ondeleteslot,
    onaddslot,
    progresscompletion,
    ontogglenotes,
    onaddnote,
    ondeletenote,
    ongrip,
    onresize,
    onfusew,
    forceMode,
  }: {
    card: Card;
    editable: boolean;
    selected: boolean;
    /** Factory slot selection: the cell whose `data-sid` matches gets `.sel`. Undefined for notebook cards. */
    selectedSlotId?: string | null;
    /** Override the global $mode gate (e.g. Factory Preview forces a live study card). */
    forceMode?: 'edit' | 'study';
    /** This card's reader state, keyed by slot id (CARD_STATE_KEY holds card-level flags). */
    state: Record<string, Record<string, unknown>>;
    notes: Annotation[];
    notesOpen: boolean;
    onselect: () => void;
    onstate: (slotId: string, next: Record<string, unknown>) => void;
    onmove: (dir: -1 | 1) => void;
    ondelete: () => void;
    onverb: (key: 'flip' | 'bare', on: boolean) => void;
    ontags: (raw: string) => void;
    onsavetype: (name: string) => void;
    onupdateslot: (slotId: string, props: SlotProps) => void;
    ondeleteslot: (slotId: string) => void;
    onaddslot: (type: string, face?: 'back') => void;
    progresscompletion: (props: SlotProps) => { done: number; total: number; pct: number };
    ontogglenotes: () => void;
    onaddnote: (body: string) => void;
    ondeletenote: (id: string) => void;
    /** Grip pointerdown → the App starts the engine drag with this card's .furn as source. */
    ongrip: (ev: PointerEvent, srcEl: HTMLElement) => void;
    onresize: (w: number) => void;
    onfusew: (leftId: string, rightId: string, leftW: number, rightW: number) => void;
  } = $props();

  let newSlotType = $state('text');
  let namingType = $state(false);
  let typeNameDraft = $state('');

  const studying = $derived((forceMode ?? $mode) === 'study');
  const flipped = $derived(cardState[CARD_STATE_KEY]?.flipped === true);
  const done = $derived(studying && isCardDone(card, cardState));

  // Scope failures (e.g. a cycle authored in Edit mode) must be visible, not silently empty.
  // Variables are card-scoped: both faces of a flip card share one scope.
  const resolved = $derived.by(() => {
    try {
      return { scope: buildCardScope([...card.slots, ...(card.back ?? [])], {}), error: '' };
    } catch (e) {
      return { scope: {}, error: e instanceof Error ? e.message : String(e) };
    }
  });
  const scope = $derived(resolved.scope);

  // Live gesture previews stay local; the model is only written by the App on commit.
  let furnEl: HTMLElement | null = $state(null);
  let liveW: number | null = $state(null);
  let resizing = $state(false);
  let liveFuse: Record<string, number> | null = $state(null);

  const styleVars = $derived(
    `--w:${liveW ?? card.w ?? 12}` + (card.accent ? `;--cardc:${card.accent}` : ''),
  );

  // colW = grid width / 12; live --w while dragging, commit the snapped value on up
  // (v1 100-drag-furniture.js:6-10). Pointercancel restores the start width (D12).
  function startCardResize(ev: PointerEvent) {
    const parent = furnEl?.parentElement;
    if (!parent) return;
    const colW = parent.getBoundingClientRect().width / 12;
    if (colW <= 0) return;
    const startW = card.w ?? 12;
    let w = startW;
    resizing = true;
    pushGestureSnapshot();
    startEdgeResize(
      ev,
      (dx) => {
        w = clampCardW(startW + dx / colW);
        liveW = w;
      },
      (mv) => {
        resizing = false;
        liveW = null;
        if (mv !== null) onresize(w);
      },
    );
  }

  // Split the pair's summed fuseW by the pointer's ratio between the two cell rects
  // (v1 100-drag-furniture.js:22-26). The right cell comes from the DOM, not the array
  // successor, so seams still pair correctly around reveal-hidden cells.
  function startFuseResize(ev: PointerEvent, leftId: string) {
    const gut = ev.currentTarget as HTMLElement;
    const lc = gut.previousElementSibling as HTMLElement | null;
    const rc = gut.nextElementSibling as HTMLElement | null;
    const rightId = rc?.dataset.sid;
    if (!lc || !rc || !rightId) return;
    const all = [...card.slots, ...(card.back ?? [])];
    const left = all.find((s) => s.id === leftId);
    const right = all.find((s) => s.id === rightId);
    if (!left || !right) return;
    const total = (left.fuseW ?? 1) + (right.fuseW ?? 1);
    const lb = lc.getBoundingClientRect();
    const rb = rc.getBoundingClientRect();
    const span = rb.right - lb.left;
    if (span <= 0) return;
    let lw = left.fuseW ?? 1;
    let rw = right.fuseW ?? 1;
    pushGestureSnapshot();
    startEdgeResize(
      ev,
      (_dx, _dy, mv) => {
        [lw, rw] = fuseSplit(total, (mv.clientX - lb.left) / span);
        liveFuse = { [leftId]: lw, [rightId]: rw };
      },
      (mv) => {
        liveFuse = null;
        if (mv !== null) onfusew(leftId, rightId, lw, rw);
      },
    );
  }

  // Flipping records seenBack so flip cards can count as done once both sides were viewed.
  function flip() {
    const prev = cardState[CARD_STATE_KEY] ?? {};
    const next = prev.flipped !== true;
    onstate(CARD_STATE_KEY, { ...prev, flipped: next, seenBack: prev.seenBack === true || next });
  }

  // The whole face is the flip target (v1 data-act="flip"), except interactive slot content
  // and fuse seams — v1 excludes `.fusegut` from its flip guard (70-events.js) since P4 turns
  // the seam into a drag handle.
  function flipClick(e: MouseEvent) {
    if (
      e.target instanceof Element &&
      e.target.closest('button, input, textarea, select, label, a, .ceview, .ce, .fusegut')
    ) {
      return;
    }
    flip();
  }

  type FuseCell = { slot: Slot; index: number };
  type SlotGroup = { cells: FuseCell[]; sumw: number; fused: boolean };

  // `fuse` chains a slot to its successor: a chain is a maximal run of fuse-flagged
  // slots plus the slot after the last flag (v1 renderSlots, 60-stage.js).
  function groupSlots(slots: Slot[]): SlotGroup[] {
    const groups: SlotGroup[] = [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.fuse && slots[i + 1]) {
        let j = i;
        while (slots[j]?.fuse && slots[j + 1]) j++;
        const cells = slots.slice(i, j + 1).map((slot, k) => ({ slot, index: i + k }));
        const sumw = Math.min(
          12,
          cells.reduce((a, c) => a + (c.slot.w ?? 12), 0),
        );
        groups.push({ cells, sumw, fused: true });
        i = j;
      } else {
        groups.push({ cells: [{ slot: s, index: i }], sumw: s.w ?? 12, fused: false });
      }
    }
    return groups;
  }

  // A hidden cell leaves the fused row entirely — no orphan seams.
  function chainCells(cells: FuseCell[], face: Slot[], edit: boolean): FuseCell[] {
    return cells.filter(
      (c) =>
        getSlot(c.slot.type) &&
        (edit || shouldShow(c.slot.verbs, scope, priorComplete(face, c.index))),
    );
  }

  function slotState(slotId: string): Record<string, unknown> {
    return cardState[slotId] ?? {};
  }

  // A slot's prior completable siblings must all be done for a `sequential` slot to appear.
  function priorComplete(slots: Slot[], i: number): boolean {
    for (let j = 0; j < i; j++) {
      const s = slots[j];
      const t = getSlot(s.type);
      if (t?.completable && t.isDone && !t.isDone(s.props, slotState(s.id))) return false;
    }
    return true;
  }

  function saveType() {
    const name = typeNameDraft.trim();
    namingType = false;
    if (name) onsavetype(name);
  }

  // v1 90-drag-engine.js:156 — the grip owns the pointerdown; the card click must not fire.
  function gripDown(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (furnEl) ongrip(e, furnEl);
  }

  function handleClick(e: MouseEvent) {
    if (studying || !editable) return;
    // Card selection is exclusive with section selection — the room's click handler must not fire.
    e.stopPropagation();
    if (
      e.target instanceof Element &&
      e.target.closest('button, input, textarea, select, label, a, .ceview, .ce')
    ) {
      return;
    }
    onselect();
  }
</script>

{#snippet editBody(slot: Slot)}
  {@const slotType = getSlot(slot.type)}
  {#if slotType}
    <div class="slot editing">
      <slotType.renderEdit
        props={slot.props}
        {scope}
        onUpdate={(p) => onupdateslot(slot.id, p)}
        state={slotState(slot.id)}
        onState={(next) => onstate(slot.id, next)}
      />
      <button class="slot-del" title="Remove slot" onclick={() => ondeleteslot(slot.id)}>✕</button>
    </div>
  {/if}
{/snippet}

{#snippet studyBody(slot: Slot, i: number, face: Slot[])}
  {@const slotType = getSlot(slot.type)}
  {#if slotType}
    <div class="slot">
      <VerbWrapper
        verbs={slot.verbs}
        visible={shouldShow(slot.verbs, scope, priorComplete(face, i))}
        locked={isLocked(slot.verbs?.locked, priorComplete(face, i))}
      >
        {#if slot.type === 'progress'}
          <ProgressStudy
            props={slot.props as ProgressProps}
            completion={progresscompletion(slot.props)}
          />
        {:else}
          <slotType.renderStudy
            props={slot.props}
            {scope}
            state={slotState(slot.id)}
            onState={(next) => onstate(slot.id, next)}
          />
        {/if}
      </VerbWrapper>
    </div>
  {/if}
{/snippet}

<!-- One .cardslot per slot; consecutive fused slots share a .cardslot (v1 renderSlots).
     `emptyLabel` renders v1's muted "front empty" / "back empty" placeholder for a bare flip face. -->
{#snippet faceRows(face: Slot[], edit: boolean, emptyLabel = '')}
  <div class="cardrow">
    {#if emptyLabel && face.length === 0}
      <span class="muted sm face-empty">{emptyLabel}</span>
    {/if}
    {#each groupSlots(face) as group (group.cells[0].slot.id)}
      {#if group.fused}
        {@const vis = chainCells(group.cells, face, edit)}
        {#if vis.length}
          <div class="cardslot" style="--sw:{group.sumw}">
            <div class="fusewrap">
              {#each vis as cell, k (cell.slot.id)}
                {#if k}<div
                    class="fusegut"
                    role="presentation"
                    data-fusegut={vis[k - 1].slot.id}
                    onpointerdown={(e) => startFuseResize(e, vis[k - 1].slot.id)}
                  ></div>{/if}
                <div
                  class="fusecell"
                  class:sel={cell.slot.id === selectedSlotId}
                  data-sid={cell.slot.id}
                  style="flex:{liveFuse?.[cell.slot.id] ?? cell.slot.fuseW ?? 1}"
                >
                  {#if edit}
                    {@render editBody(cell.slot)}
                  {:else}
                    {@render studyBody(cell.slot, cell.index, face)}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <div
          class="cardslot"
          class:sel={group.cells[0].slot.id === selectedSlotId}
          data-sid={group.cells[0].slot.id}
          style="--sw:{group.sumw}"
        >
          {#if edit}
            {@render editBody(group.cells[0].slot)}
          {:else}
            {@render studyBody(group.cells[0].slot, group.cells[0].index, face)}
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={furnEl}
  class="furn"
  class:sel={selected && !studying}
  class:bare={card.verbs?.bare}
  class:done
  class:dragging={resizing}
  style={styleVars}
  data-card={card.id}
  role="presentation"
  onclick={handleClick}
>
  {#if editable}
    <span class="grip" role="presentation" onpointerdown={gripDown}>⋮⋮</span>
    <span class="rz" role="presentation" onpointerdown={startCardResize}></span>
  {/if}
  {#if studying && done}
    <div class="done-badge">Done</div>
  {/if}
  <div class="body">
    {#if studying && resolved.error}
      <div class="scope-error">Variables unavailable: {resolved.error}</div>
    {/if}
    {#if editable}
      <div class="cardtools">
        <button title="Move card up" onclick={() => onmove(-1)}>↑</button>
        <button title="Move card down" onclick={() => onmove(1)}>↓</button>
        <label>
          <input
            type="checkbox"
            checked={card.verbs?.flip === true}
            onchange={(e) => onverb('flip', e.currentTarget.checked)}
          /> flip</label>
        <label>
          <input
            type="checkbox"
            checked={card.verbs?.bare === true}
            onchange={(e) => onverb('bare', e.currentTarget.checked)}
          /> bare</label>
        <input
          class="tags-input"
          placeholder="tags, comma-separated"
          value={card.tags?.join(', ') ?? ''}
          onchange={(e) => ontags(e.currentTarget.value)}
        />
        <span class="spacer"></span>
        {#if namingType}
          <input
            class="type-name-input"
            placeholder="Card type name"
            bind:value={typeNameDraft}
            onkeydown={(e) => {
              if (e.key === 'Enter') saveType();
              if (e.key === 'Escape') namingType = false;
            }}
          />
          <button onclick={saveType}>save</button>
        {:else}
          <button
            title="Save this card as a reusable card type"
            onclick={() => {
              namingType = true;
              typeNameDraft = '';
            }}>→ type</button>
        {/if}
        <button title="Delete card" onclick={ondelete}>✕</button>
      </div>
      {#if card.verbs?.flip}
        <div class="fc-edit">
          <div class="fc-side">
            <div class="faceflag">FRONT</div>
            {@render faceRows(card.slots, true, 'front empty')}
          </div>
          <div class="fc-side back">
            <div class="faceflag">BACK</div>
            {@render faceRows(card.back ?? [], true, 'back empty')}
          </div>
        </div>
      {:else}
        {@render faceRows(card.slots, true)}
      {/if}
      <div class="slot-adder">
        <select bind:value={newSlotType}>
          {#each allSlots() as t (t.type)}
            <option value={t.type}>{t.type}</option>
          {/each}
        </select>
        <button onclick={() => onaddslot(newSlotType)}>+ slot</button>
        {#if card.verbs?.flip}
          <button onclick={() => onaddslot(newSlotType, 'back')}>+ slot (back)</button>
        {/if}
      </div>
    {:else}
      {#if card.verbs?.flip && studying}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="fc" class:flipped onclick={flipClick} role="presentation">
          <div class="fc-stack">
            <div class="fc-face">
              {@render faceRows(card.slots, false, 'front empty')}
            </div>
            <div class="fc-face back">
              {@render faceRows(card.back ?? [], false, 'back empty')}
            </div>
          </div>
          <div class="sm muted" style="margin-top:6px">↻ click to flip</div>
        </div>
      {:else if card.verbs?.flip}
        <!-- locked section in Edit mode: v1 renders both faces read-only (fc-edit, live slots) -->
        <div class="fc-edit">
          <div class="fc-side">
            <div class="faceflag">FRONT</div>
            {@render faceRows(card.slots, false, 'front empty')}
          </div>
          <div class="fc-side back">
            <div class="faceflag">BACK</div>
            {@render faceRows(card.back ?? [], false, 'back empty')}
          </div>
        </div>
      {:else}
        {@render faceRows(card.slots, false)}
      {/if}
      {#if studying}
        <button class="notes-toggle" class:has-notes={notes.length > 0} onclick={ontogglenotes}>
          ✎ {notes.length > 0 ? `notes (${notes.length})` : 'note'}
        </button>
        {#if notesOpen}
          <CardNotes {notes} onadd={onaddnote} ondelete={ondeletenote} />
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style>
  /* .cardtools styling is v2-addition CSS in app.css (after the ported v1 region) */
  .slot-del {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
    padding: 2px 4px;
  }
  .slot-del:hover {
    opacity: 1;
  }
  .furn.done {
    border-color: var(--accent, #7c3aed);
  }
  .tags-input {
    background: transparent;
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 11px;
    padding: 2px 6px;
    width: 150px;
  }
  .type-name-input {
    background: var(--panel);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 12px;
    padding: 2px 6px;
    width: 140px;
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
  .scope-error {
    font-size: 12px;
    color: #dc2626;
    margin-bottom: 8px;
  }
  .notes-toggle {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    opacity: 0.4;
    padding: 4px 0 0;
  }
  .notes-toggle:hover,
  .notes-toggle.has-notes {
    opacity: 0.8;
  }
  .notes-toggle.has-notes {
    color: var(--accent, #7c3aed);
  }
  .slot {
    margin-bottom: 8px;
  }
  .slot:last-child {
    margin-bottom: 0;
  }
  .slot.editing {
    display: flex;
    align-items: flex-start;
    gap: 4px;
  }
  .slot.editing > :global(:first-child) {
    flex: 1;
  }
  .slot-adder {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }
  .slot-adder select {
    background: var(--panel);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 12px;
    padding: 2px 6px;
  }
  .slot-adder button {
    background: none;
    border: 1px dashed var(--line);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.6;
    padding: 4px 10px;
  }
  .slot-adder button:hover {
    opacity: 1;
    border-color: var(--accent, #7c3aed);
  }
</style>
