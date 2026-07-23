<script lang="ts">
  import { getSlot } from '../slots/registry';
  import { buildCardScope } from '../card-scope';
  import ProgressEdit from '../slots/ProgressEdit.svelte';
  import type { ProgressProps } from '../slots/progress';
  import type { Card, Slot, SlotProps } from '../types';
  import type { Scope } from '../variable-graph';

  let {
    card,
    state: cardState,
    live = {},
    alltags = [],
    onupdateslot,
    onstate,
    onduplicate,
    onremove,
    oneditinfactory,
    onclose,
  }: {
    card: Card;
    /** This card's reader state, keyed by slot id — same channel CardView threads. */
    state: Record<string, Record<string, unknown>>;
    /** Session-layer scope values keyed by variable name. */
    live?: Scope;
    alltags?: string[];
    onupdateslot: (slotId: string, props: SlotProps) => void;
    onstate: (slotId: string, next: Record<string, unknown>) => void;
    onduplicate: () => void;
    onremove: () => void;
    /** Absent in the shared Reader — it has no Factory. */
    oneditinfactory?: () => void;
    onclose: () => void;
  } = $props();

  // Same card-scoped resolution as CardView; the panel is a second view of the same document.
  const resolved = $derived.by(() => {
    try {
      return buildCardScope([...card.slots, ...(card.back ?? [])], live);
    } catch {
      return {} as Scope;
    }
  });

  function slotState(slotId: string): Record<string, unknown> {
    return cardState[slotId] ?? {};
  }
</script>

{#snippet fields(face: Slot[])}
  {#each face as slot (slot.id)}
    {@const slotType = getSlot(slot.type)}
    {#if slotType}
      <div class="panel-slot">
        <div class="panel-slot-type muted sm">{slot.type}</div>
        {#if slot.type === 'progress'}
          <ProgressEdit
            props={slot.props as ProgressProps}
            allTags={alltags}
            onUpdate={(p) => onupdateslot(slot.id, p)}
          />
        {:else}
          <slotType.renderEdit
            props={slot.props}
            scope={resolved}
            onUpdate={(p) => onupdateslot(slot.id, p)}
            state={slotState(slot.id)}
            onState={(next) => onstate(slot.id, next)}
          />
        {/if}
      </div>
    {/if}
  {/each}
{/snippet}

<div class="sect card-panel">
  <h3 title="Edit this placed card's content. Structure is sealed — fork it in the Factory to change it.">
    🗂 Card
    <button class="btn sm ghost close" title="Deselect card" onclick={onclose}>close</button>
  </h3>
  <div class="panel-fields" data-history="edit">
    {#if card.verbs?.flip}
      <div class="bm-lbl">Front content</div>
      {@render fields(card.slots)}
      <div class="bm-lbl">Back content</div>
      {@render fields(card.back ?? [])}
    {:else}
      {@render fields(card.slots)}
    {/if}
  </div>
  <div class="panel-actions">
    <button
      class="btn sm"
      title="Duplicate card"
      onclick={onduplicate}>⧉ Duplicate</button>
    {#if oneditinfactory}
      <button
        class="btn sm"
        title={card.typeId ? 'Edit in Factory' : 'Send to Factory'}
        onclick={oneditinfactory}>🏭 Factory</button>
    {/if}
    <button class="btn sm warn" title="Remove card" onclick={onremove}>🗑 Remove</button>
  </div>
</div>

<style>
  .card-panel h3 .close {
    float: right;
  }
  .panel-fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
  .panel-slot-type {
    margin-bottom: 4px;
  }
  .bm-lbl {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .panel-actions {
    display: flex;
    gap: 6px;
    margin-top: 12px;
  }
</style>
