<script lang="ts">
  import { dustState } from '../drag/dust.svelte';
</script>

<!-- Pure display: every drag reaches it through the pointer engine's dust target. -->
<div
  id="dustbin"
  class:show={dustState.show}
  class:hot={dustState.hot}
  title="drop here to delete"
>🗑<span class="sm">drop to delete</span></div>
