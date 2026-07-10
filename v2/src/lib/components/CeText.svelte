<script lang="ts">
  import { renderMarkdown } from '../markdown';
  import type { Scope } from '../variable-graph';

  let {
    value,
    onchange,
    multiline = true,
    placeholder = '',
    scope = {},
  }: {
    value: string;
    onchange: (v: string) => void;
    multiline?: boolean;
    placeholder?: string;
    scope?: Scope;
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let suppressBlur = false;

  const fieldSizing =
    typeof CSS !== 'undefined' &&
    CSS.supports &&
    CSS.supports('field-sizing', 'content');

  function startEdit() {
    draft = value;
    suppressBlur = false;
    editing = true;
  }

  function commit() {
    if (suppressBlur) {
      suppressBlur = false;
      return;
    }
    if (draft !== value) onchange(draft);
    suppressBlur = true;
    editing = false;
  }

  function cancel() {
    suppressBlur = true;
    editing = false;
  }

  function onViewKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEdit();
    }
  }

  function onEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    }
  }

  $effect(() => {
    if (!editing || !textarea) return;
    const ta = textarea;
    ta.focus();
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
    if (!fieldSizing) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 2 + 'px';
    }
  });

  function autoGrow() {
    if (fieldSizing || !textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 2 + 'px';
  }
</script>

{#if editing}
  <textarea
    bind:this={textarea}
    class="ce"
    bind:value={draft}
    {placeholder}
    onblur={commit}
    onkeydown={onEditKeydown}
    oninput={autoGrow}
  ></textarea>
{:else if value}
  <div
    class="ceview"
    role="button"
    tabindex="0"
    onclick={startEdit}
    onkeydown={onViewKeydown}
  >
    {@html renderMarkdown(value, scope)}
  </div>
{:else}
  <div
    class="ceview ce-placeholder"
    role="button"
    tabindex="0"
    onclick={startEdit}
    onkeydown={onViewKeydown}
  >
    {placeholder}
  </div>
{/if}

<style>
  .ce-placeholder {
    color: var(--muted);
  }
</style>
