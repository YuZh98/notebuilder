<script lang="ts">
  import { mode } from '../stores/mode';
  import StoreLane from './StoreLane.svelte';
  import ProductDetail from './ProductDetail.svelte';
  import CardPanel from './CardPanel.svelte';
  import { dustState } from '../drag/dust.svelte';
  import {
    SERVICE_ORDER,
    SERVICE_FEATURES,
    SERVICE_ACTIONS,
    flipAllApplicable,
    type ServiceKey,
  } from '../services';
  import { STORES, type CardType, type Variety } from '../card-types';
  import type { Card, Section, SlotProps } from '../types';
  import type { Scope } from '../variable-graph';

  let {
    notebookName,
    canPersist,
    candelete = true,
    cardTypes,
    selProd,
    section,
    card = null,
    cardstate = {},
    cardlive = {},
    alltags = [],
    oncardupdateslot,
    oncardstate,
    oncardduplicate,
    oncardremove,
    oncardfactory,
    oncardclose,
    onrename,
    ondelete,
    onpickprod,
    onplaceprod,
    onclosedetail,
    ongrip,
    onvariety,
    onsvctoggle,
  }: {
    notebookName: string;
    canPersist: boolean;
    /** Whether the Delete-notebook control is offered (the shared Reader has no store to delete from). */
    candelete?: boolean;
    cardTypes: CardType[];
    selProd: string | null;
    /** Currently selected (non-divider) section, or null — drives the Section ops panel. */
    section?: Section | null;
    /** Currently selected card, or null — drives the card inspector panel (v1 sideFurnInspector). */
    card?: Card | null;
    cardstate?: Record<string, Record<string, unknown>>;
    cardlive?: Scope;
    alltags?: string[];
    oncardupdateslot?: (slotId: string, props: SlotProps) => void;
    oncardstate?: (slotId: string, next: Record<string, unknown>) => void;
    oncardduplicate?: () => void;
    oncardremove?: () => void;
    oncardfactory?: () => void;
    oncardclose?: () => void;
    onrename: (name: string) => void;
    ondelete: () => void;
    onpickprod: (id: string) => void;
    onplaceprod: (variety: Variety | null, draft: Record<string, SlotProps>) => void;
    onclosedetail: () => void;
    ongrip?: (id: string, ev: PointerEvent, srcEl: HTMLElement) => void;
    onvariety?: (v: Variety | null) => void;
    onsvctoggle?: (key: ServiceKey) => void;
  } = $props();

  const selType = $derived(selProd ? (cardTypes.find((t) => t.id === selProd) ?? null) : null);
  const typesFor = (storeId: string | null) =>
    cardTypes.filter((t) => (storeId ? (t.store || null) === storeId : !t.store));

  const SVC_DEFS: Record<string, { icon: string; label: string }> = Object.fromEntries(
    [...SERVICE_FEATURES, ...SERVICE_ACTIONS].map((d) => [d.key, d]),
  );
  let secOpsFolded = $state(false);

  // flipAll can only be enabled on a section that has a flip-capable card (v1 50-render.js:102).
  const svcCap = (key: ServiceKey) => key !== 'flipAll' || !section || flipAllApplicable(section);

  // The dustbin is pointer-engine driven; reveal it for the native chip drag so a drop-to-disable lands.
  function svcDragStart(e: DragEvent, key: ServiceKey) {
    e.dataTransfer?.setData('text/nb-svc', key);
    dustState.show = true;
  }
  function svcDragEnd() {
    dustState.show = false;
    dustState.hot = false;
  }
</script>

<div id="side">
  {#if $mode === 'study'}
    <div class="sect"><h3 title="Reading mode — interact with cards, filter by 🏷 tag, collapse rooms. Switch to ✏️ Edit to change things.">📖 Study</h3></div>
  {:else}
    <div class="sect">
      <h3>📓 Notebook</h3>
      <div class="col">
        <input value={notebookName} placeholder="notebook name" data-history="edit" onchange={(e) => onrename(e.currentTarget.value)} />
        {#if candelete}
          <button class="btn warn" onclick={ondelete}>🗑 Delete notebook</button>
        {/if}
        {#if !canPersist}
          <p class="muted sm">Browser demo — changes are not saved.</p>
        {/if}
      </div>
    </div>
    {#if card}
      {#key card.id}
        <CardPanel
          {card}
          state={cardstate}
          live={cardlive}
          {alltags}
          onupdateslot={(slotId, props) => oncardupdateslot?.(slotId, props)}
          onstate={(slotId, next) => oncardstate?.(slotId, next)}
          onduplicate={() => oncardduplicate?.()}
          onremove={() => oncardremove?.()}
          oneditinfactory={oncardfactory}
          onclose={() => oncardclose?.()}
        />
      {/key}
    {/if}
    <div class="store-lane">
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <h4
        style="cursor:pointer"
        role="button"
        tabindex="0"
        title="Operations for the current section — enabled ones appear in 📖 Study."
        onclick={() => (secOpsFolded = !secOpsFolded)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            secOpsFolded = !secOpsFolded;
          }
        }}
      >
        {secOpsFolded ? '▸' : '▾'} ⚙ Section ops
        {#if section}<span class="muted sm">{section.name}</span>{/if}
      </h4>
      {#if !secOpsFolded}
        <div class="palette" style="margin:6px 0">
          {#each SERVICE_ORDER as key (key)}
            {@const cap = svcCap(key)}
            <button
              class="chip"
              class:on={section?.services?.[key]}
              data-svc={key}
              draggable={cap}
              disabled={!cap}
              title={cap ? 'click to toggle, or drag onto the section' : 'needs a flip card'}
              ondragstart={(e) => svcDragStart(e, key)}
              ondragend={svcDragEnd}
              onclick={() => onsvctoggle?.(key)}>{SVC_DEFS[key].icon} {SVC_DEFS[key].label}</button>
          {/each}
        </div>
      {/if}
    </div>
    {#if selType}
      {#key selType.id}
        <ProductDetail
          type={selType}
          onplace={onplaceprod}
          onclose={onclosedetail}
          {ongrip}
          {onvariety}
        />
      {/key}
    {:else}
      <div class="sect">
        <h3 title="Click a product for detail, then place it in the current section.">🛒 Store</h3>
        {#each STORES as st (st.id)}
          <StoreLane store={st} types={typesFor(st.id)} onpick={onpickprod} {ongrip} />
        {/each}
        <StoreLane store={null} types={typesFor(null)} onpick={onpickprod} {ongrip} />
      </div>
    {/if}
  {/if}
</div>
