<script lang="ts">
  import type { TextInputProps } from './text-input';

  let { props, state = {}, onState } = $props<{
    props: TextInputProps;
    state?: Record<string, unknown>;
    onState?: (next: Record<string, unknown>) => void;
  }>();

  let value = $derived(typeof state.value === 'string' ? state.value : '');

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    onState?.({ ...state, value: target.value });
  }
</script>

<div class="text-input-study">
  <input
    type="text"
    value={value}
    placeholder={props.placeholder ?? ''}
    oninput={handleInput}
    class:filled={value !== ''}
  />
</div>

<style>
  .text-input-study input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 14px;
    font-family: inherit;
    box-sizing: border-box;
  }
  .text-input-study input.filled {
    border-color: var(--accent, #7c3aed);
  }
</style>
