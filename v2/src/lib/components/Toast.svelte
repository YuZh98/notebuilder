<script lang="ts">
  import { toastState } from '../toast.svelte';
</script>

{#if toastState.visible}
  <div class="toast" role="status">{toastState.message}</div>
{/if}
