<script lang="ts">
  import { prodIcon, type CardType, type Store } from '../card-types';

  let {
    store,
    types,
    foldedInit = false,
    onpick,
    ongrip,
  }: {
    store: Store | null;
    types: CardType[];
    foldedInit?: boolean;
    onpick: (id: string) => void;
    ongrip?: (id: string, ev: PointerEvent, srcEl: HTMLElement) => void;
  } = $props();

  let folded = $state(foldedInit);
</script>

<div class="store-lane" data-lane={store?.id ?? ''}>
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <h4
    style="cursor:pointer"
    title="collapse / expand"
    role="button"
    tabindex="0"
    onclick={() => (folded = !folded)}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        folded = !folded;
      }
    }}
  >
    {folded ? '▸' : '▾'}
    {store ? store.name : '🛠 Workshop'}
    <span class="muted sm">{types.length}</span>
  </h4>
  {#if !folded}
    {#if !types.length}
      <div class="muted sm">—</div>
    {:else}
      <div class="palette">
        {#each types as ct (ct.id)}
          <button
            class="chip prodchip"
            data-prod={ct.id}
            title={ct.name}
            onpointerdown={(e) => ongrip?.(ct.id, e, e.currentTarget)}
            onclick={() => onpick(ct.id)}>{prodIcon(ct)} {ct.name}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>
