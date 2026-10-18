<script lang="ts">
  /**
   * D2d — the review queue for a notebook made "From AI": how many cards are still unreviewed
   * drafts, a Next button that walks them, and Mark all reviewed. Props and callbacks only: the
   * host finds, selects and scrolls to the next draft, and owns confirmation and undo.
   */
  let {
    count,
    onnext,
    onmarkall,
  }: {
    /** Draft cards left to review; the bar renders nothing at 0. */
    count: number;
    onnext: () => void;
    onmarkall: () => void;
  } = $props();
</script>

{#if count > 0}
  <div class="drafts-bar" role="group" aria-label="AI drafts to review">
    <span
      class="db-count sm"
      title="Made by AI and not yet reviewed — check each card, edit it if needed, then mark it ✓ Reviewed"
    >{count} draft{count === 1 ? '' : 's'} to review</span>
    <span class="db-acts">
      <button class="btn sm" title="Select and scroll to the next draft card" onclick={onnext}>Next <span aria-hidden="true">▸</span></button>
      <button class="btn sm ghost" title="Mark every draft card reviewed (undoable)" onclick={onmarkall}>Mark all reviewed</button>
    </span>
  </div>
{/if}

<style>
  .drafts-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    border: 1px dashed var(--accent2);
    border-radius: 9px;
    padding: 6px 8px;
  }
  .db-count {
    flex: 1 1 auto;
    color: var(--accent2);
    font-weight: 600;
  }
  .db-acts {
    display: flex;
    gap: 6px;
  }
</style>
