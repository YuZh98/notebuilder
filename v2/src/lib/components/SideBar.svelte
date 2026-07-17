<script lang="ts">
  import { mode } from '../stores/mode';
  import StoreLane from './StoreLane.svelte';
  import ProductDetail from './ProductDetail.svelte';
  import { STORES, type CardType, type Variety } from '../card-types';
  import type { SlotProps } from '../types';

  let {
    notebookName,
    canPersist,
    cardTypes,
    selProd,
    onrename,
    ondelete,
    onpickprod,
    onplaceprod,
    onclosedetail,
  }: {
    notebookName: string;
    canPersist: boolean;
    cardTypes: CardType[];
    selProd: string | null;
    onrename: (name: string) => void;
    ondelete: () => void;
    onpickprod: (id: string) => void;
    onplaceprod: (variety: Variety | null, draft: Record<string, SlotProps>) => void;
    onclosedetail: () => void;
  } = $props();

  const selType = $derived(selProd ? (cardTypes.find((t) => t.id === selProd) ?? null) : null);
  const typesFor = (storeId: string | null) =>
    cardTypes.filter((t) => (storeId ? (t.store || null) === storeId : !t.store));
</script>

<div id="side">
  {#if $mode === 'study'}
    <div class="sect"><h3 title="Reading mode — interact with cards, filter by 🏷 tag, collapse rooms. Switch to ✏️ Edit to change things.">📖 Study</h3></div>
  {:else}
    <div class="sect">
      <h3>📓 Notebook</h3>
      <div class="col">
        <input value={notebookName} placeholder="notebook name" onchange={(e) => onrename(e.currentTarget.value)} />
        <button class="btn warn" onclick={ondelete}>🗑 Delete notebook</button>
        {#if !canPersist}
          <p class="muted sm">Browser demo — changes are not saved.</p>
        {/if}
      </div>
    </div>
    {#if selType}
      {#key selType.id}
        <ProductDetail type={selType} onplace={onplaceprod} onclose={onclosedetail} />
      {/key}
    {:else}
      <div class="sect">
        <h3 title="Click a product for detail, then place it in the current section.">🛒 Store</h3>
        {#each STORES as st (st.id)}
          <StoreLane store={st} types={typesFor(st.id)} onpick={onpickprod} />
        {/each}
        <StoreLane store={null} types={typesFor(null)} onpick={onpickprod} />
      </div>
    {/if}
  {/if}
</div>
