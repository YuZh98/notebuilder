<script lang="ts">
  import { dustState } from '../drag/dust.svelte';
</script>

<div id="dustbin" class:show={dustState.show} class:hot={dustState.hot} title="drop here to delete">🗑<span class="sm">drop to delete</span></div>
