<script lang="ts">
  import type { Annotation } from '../types';

  let {
    notes,
    onadd,
    ondelete,
  }: {
    notes: Annotation[];
    onadd: (body: string) => void;
    ondelete: (id: string) => void;
  } = $props();

  let draft = $state('');

  function submit() {
    const body = draft.trim();
    if (!body) return;
    onadd(body);
    draft = '';
  }
</script>

<div class="notes">
  {#each notes as note (note.id)}
    <div class="note">
      <p>{note.body}</p>
      <button class="del" title="Delete note" aria-label="Delete note" onclick={() => ondelete(note.id)}
        >✕</button
      >
    </div>
  {/each}
  <div class="composer">
    <textarea
      rows="2"
      placeholder="Add a private note… (never exported)"
      bind:value={draft}
      onkeydown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
      }}
    ></textarea>
    <button onclick={submit} disabled={!draft.trim()}>Add</button>
  </div>
</div>

<style>
  .notes {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px dashed var(--line);
    font-size: var(--fs-md);
  }
  .note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent, #7c3aed) 8%, transparent);
    margin-bottom: var(--space-3);
  }
  .note p {
    flex: 1;
    margin: 0;
    white-space: pre-wrap;
  }
  /* The delete control was easy to miss at 0.4 with no hit area of its own. */
  .note .del {
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: inherit;
    cursor: pointer;
    font-size: var(--fs-sm);
    line-height: 1;
    opacity: 0.55;
    padding: 3px var(--space-3); /* token-exempt: 3px sits off the 2px scale; snapping it would resize the hit area */
  }
  .note:hover .del,
  .note .del:focus-visible {
    opacity: 1;
    border-color: var(--line);
  }
  .note .del:hover {
    color: var(--warn, #dc2626);
  }
  .composer {
    display: flex;
    gap: var(--space-4);
    align-items: flex-end;
  }
  textarea {
    flex: 1;
    background: var(--bg);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: var(--fs-sm);
    padding: var(--space-3) var(--space-4);
    resize: vertical;
  }
  .composer button {
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: inherit;
    cursor: pointer;
    font-size: var(--fs-sm);
    padding: var(--space-2) var(--space-5);
  }
  .composer button:not(:disabled):hover {
    border-color: var(--accent, #7c3aed);
  }
  .composer button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
