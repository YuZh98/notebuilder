<script lang="ts">
  let { onclose }: { onclose: () => void } = $props();

  const ROWS: [string, string][] = [
    ['j · ↓ · →', 'focus the next card'],
    ['k · ↑ · ←', 'focus the previous card'],
    ['space · f', 'flip the focused card'],
    ['1 – 9', 'pick that answer option'],
    ['Enter', 'submit the answer'],
    ['x', 'tick the next checklist item'],
    ['Esc', 'clear the focus'],
    ['⌘/Ctrl Enter', 'switch Edit ⇄ Study'],
    ['⌘/Ctrl + · − · 0', 'zoom in · out · reset'],
    ['?', 'open or close this list'],
  ];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="modal kb-modal"
  onclick={(e) => e.target === e.currentTarget && onclose()}
>
  <div class="modal-box kb-box" role="dialog" aria-label="Keyboard shortcuts">
    <h3 style="margin:0 0 var(--space-4)">⌨ Study shortcuts</h3>
    <dl class="kb-list">
      {#each ROWS as [keys, what] (keys)}
        <dt><kbd>{keys}</kbd></dt>
        <dd>{what}</dd>
      {/each}
    </dl>
    <div class="row" style="margin-top:var(--space-5)">
      <span class="muted sm">? or Esc to close</span>
      <span class="spacer"></span>
      <button class="btn sm" onclick={onclose}>Close</button>
    </div>
  </div>
</div>

<style>
  /* Mirrors SealModal: the backdrop positions itself, the box reuses the global .modal-box chrome. */
  .kb-modal {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px; /* token-exempt: matches the app.css #modal backdrop inset */
    background: rgba(0, 0, 0, 0.55);
  }
  .kb-box {
    max-width: 380px; /* token-exempt: one-off dialog width, not a spacing value */
  }
  .kb-list {
    display: grid;
    grid-template-columns: max-content 1fr;
    align-items: baseline;
    gap: var(--space-2) var(--space-5);
    margin: 0;
  }
  .kb-list dd {
    margin: 0;
    font-size: var(--fs-sm);
    opacity: 0.85;
  }
  kbd {
    display: inline-block;
    background: var(--panel2, var(--panel));
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--ink);
    font-family: ui-monospace, monospace;
    font-size: var(--fs-xs);
    padding: var(--space-1) var(--space-3);
    white-space: nowrap;
  }
</style>
