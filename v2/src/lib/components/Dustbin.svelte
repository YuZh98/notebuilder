<script lang="ts">
  import { dustState } from '../drag/dust.svelte';
  import type { ServiceKey } from '../services';

  let { onsvcdrop }: { onsvcdrop?: (key: ServiceKey) => void } = $props();

  function over(e: DragEvent) {
    if (!(e.dataTransfer?.types ?? []).includes('text/nb-svc')) return;
    e.preventDefault();
    dustState.hot = true;
  }
  function leave() {
    dustState.hot = false;
  }
  function drop(e: DragEvent) {
    const key = e.dataTransfer?.getData('text/nb-svc');
    if (!key) return;
    e.preventDefault();
    dustState.hot = false;
    onsvcdrop?.(key as ServiceKey);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  id="dustbin"
  class:show={dustState.show}
  class:hot={dustState.hot}
  title="drop here to delete"
  ondragover={over}
  ondragleave={leave}
  ondrop={drop}
>🗑<span class="sm">drop to delete</span></div>
