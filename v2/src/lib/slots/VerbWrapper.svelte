<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { VerbConfig } from '../types';
  import { verbClasses } from '../verbs';

  let {
    verbs,
    visible,
    locked,
    children,
  }: {
    verbs?: VerbConfig;
    visible: boolean;
    locked: boolean;
    children: Snippet;
  } = $props();

  let hintOpen = $state(false);
  const classes = $derived(verbClasses(verbs) + (locked ? ' locked' : ''));
</script>

{#if visible}
  <div class="verb-wrapper {classes}" aria-disabled={locked || undefined}>
    {@render children()}
    {#if verbs?.hint}
      <div class="hint-row">
        <button
          type="button"
          class="hint-toggle"
          onclick={() => (hintOpen = !hintOpen)}
          aria-expanded={hintOpen}
        >hint</button>
        {#if hintOpen}
          <p class="hint-content">{verbs.hint.content}</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .verb-wrapper {
    position: relative;
  }

  .verb-wrapper.glow {
    box-shadow: 0 0 8px 2px var(--accent, #7c5cbf);
    border-radius: 4px;
  }

  .verb-wrapper.emphasis {
    border-left: 3px solid var(--accent, #7c5cbf);
    padding-left: 8px;
  }

  .verb-wrapper.locked {
    opacity: 0.5;
    pointer-events: none;
    user-select: none;
  }

  .hint-row {
    margin-top: 4px;
  }

  .hint-toggle {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    opacity: 0.7;
  }

  .hint-toggle:hover {
    opacity: 1;
  }

  .hint-content {
    margin: 4px 0 0;
    font-size: 12px;
    opacity: 0.8;
    font-style: italic;
  }
</style>
