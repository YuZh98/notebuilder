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
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--line);
    font-size: 13px;
  }
  .note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent, #7c3aed) 8%, transparent);
    margin-bottom: 6px;
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
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    opacity: 0.55;
    padding: 3px 6px;
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
    gap: 8px;
    align-items: flex-end;
  }
  textarea {
    flex: 1;
    background: var(--bg);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    font: inherit;
    font-size: 12px;
    padding: 6px 8px;
    resize: vertical;
  }
  .composer button {
    background: none;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 10px;
  }
  .composer button:not(:disabled):hover {
    border-color: var(--accent, #7c3aed);
  }
  .composer button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
