<script lang="ts">
  import { mode } from '../stores/mode';

  let {
    notebookName,
    canPersist,
    onrename,
    ondelete,
  }: {
    notebookName: string;
    canPersist: boolean;
    onrename: (name: string) => void;
    ondelete: () => void;
  } = $props();
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
    <div class="sect">
      <h3>🛒 Store</h3>
      <p class="muted sm">Card store arrives with the Factory.</p>
    </div>
  {/if}
</div>
