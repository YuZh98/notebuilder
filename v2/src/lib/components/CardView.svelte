<script lang="ts">
  import { mode } from '../stores/mode';
  import { getSlot, allSlots } from '../slots/registry';
  import { buildCardScope } from '../card-scope';
  import { isCardDone, CARD_STATE_KEY } from '../card-done';
  import { shouldShow, isLocked } from '../verbs';
  import VerbWrapper from '../slots/VerbWrapper.svelte';
  import ProgressStudy from '../slots/ProgressStudy.svelte';
  import CardNotes from './CardNotes.svelte';
  import type { ProgressProps } from '../slots/progress';
  import type { Annotation, Card, Slot, SlotProps } from '../types';

  let {
    card,
    editable,
    selected,
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
    ondragstart,
    ondragend,
    ondragover,
    ondrop,
  }: {
    card: Card;
    editable: boolean;
    selected: boolean;
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
    ondragstart: () => void;
    ondragend: () => void;
    ondragover: (e: DragEvent) => void;
    ondrop: (e: DragEvent) => void;
  } = $props();

  let newSlotType = $state('text');
  let namingType = $state(false);
  let typeNameDraft = $state('');

  const studying = $derived($mode === 'study');
  const flipped = $derived(cardState[CARD_STATE_KEY]?.flipped === true);
  const done = $derived(studying && isCardDone(card, cardState));
  const face = $derived(studying && card.verbs?.flip && flipped ? (card.back ?? []) : card.slots);

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

  const styleVars = $derived(
    `--w:${card.w ?? 12}` + (card.accent ? `;--cardc:${card.accent}` : ''),
  );

  // Flipping records seenBack so flip cards can count as done once both sides were viewed.
  function flip() {
    const prev = cardState[CARD_STATE_KEY] ?? {};
    const next = prev.flipped !== true;
    onstate(CARD_STATE_KEY, { ...prev, flipped: next, seenBack: prev.seenBack === true || next });
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

<!-- One .cardslot per slot; Task 5 groups fuse chains here — for now every slot is a plain cell. -->
{#snippet editCell(slot: Slot)}
  {@const slotType = getSlot(slot.type)}
  {#if slotType}
    <div class="cardslot" data-sid={slot.id} style="--sw:{slot.w ?? 12}">
      <div class="slot editing">
        <slotType.renderEdit props={slot.props} {scope} onUpdate={(p) => onupdateslot(slot.id, p)} />
        <button class="slot-del" title="Remove slot" onclick={() => ondeleteslot(slot.id)}>✕</button>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet studyCell(slot: Slot, i: number)}
  {@const slotType = getSlot(slot.type)}
  {#if slotType}
    <div class="cardslot" data-sid={slot.id} style="--sw:{slot.w ?? 12}">
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
    </div>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="furn"
  class:sel={selected && !studying}
  class:bare={card.verbs?.bare}
  class:done
  class:flipped={studying && flipped}
  style={styleVars}
  data-card={card.id}
  role="presentation"
  onclick={handleClick}
  {ondragover}
  {ondrop}
>
  {#if editable}
    <span
      class="grip"
      role="presentation"
      draggable="true"
      {ondragstart}
      {ondragend}
    >⋮⋮</span>
    <span class="rz" title="resize arrives with the drag engine"></span>
  {/if}
  {#if studying && done}
    <div class="done-badge">Done</div>
  {/if}
  {#if studying && card.verbs?.flip}
    <button class="flip-toggle" onclick={flip}>{flipped ? '↩ Front' : 'Flip ↪'}</button>
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
      <div class="cardrow">
        {#each card.slots as slot (slot.id)}
          {@render editCell(slot)}
        {/each}
      </div>
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
      {#if card.verbs?.flip}
        <div class="back-divider">Back</div>
        <div class="cardrow">
          {#each card.back ?? [] as slot (slot.id)}
            {@render editCell(slot)}
          {/each}
        </div>
      {/if}
    {:else}
      <div class="cardrow">
        {#each face as slot, i (slot.id)}
          {@render studyCell(slot, i)}
        {/each}
      </div>
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
  .flip-toggle {
    position: absolute;
    z-index: 1;
    top: 8px;
    right: 12px;
    background: none;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 8px;
  }
  .furn.done .flip-toggle {
    right: 60px;
  }
  .back-divider {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.5;
    margin: 12px 0 8px;
    border-top: 1px dashed var(--line);
    padding-top: 8px;
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
