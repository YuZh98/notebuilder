<script lang="ts">
  import type { TextInputProps } from './text-input';

  let { props, onUpdate } = $props<{
    props: TextInputProps;
    onUpdate: (props: TextInputProps) => void;
  }>();

  function handlePlaceholder(e: Event) {
    const target = e.target as HTMLInputElement;
    onUpdate({ ...props, placeholder: target.value });
  }

  function handleKey(e: Event) {
    const target = e.target as HTMLInputElement;
    onUpdate({ ...props, key: target.value || undefined });
  }
</script>

<div class="text-input-edit">
  <label class="field">
    <span>Placeholder</span>
    <input
      type="text"
      value={props.placeholder ?? ''}
      placeholder="e.g. Type your answer..."
      oninput={handlePlaceholder}
    />
  </label>
  <label class="field">
    <span>Key (optional)</span>
    <input
      type="text"
      value={props.key ?? ''}
      placeholder="e.g. answer1"
      oninput={handleKey}
    />
  </label>
</div>

<style>
  .text-input-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .field span {
    width: 100px;
    flex-shrink: 0;
    opacity: 0.7;
  }
  .field input {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--border, #2a2a4a);
    border-radius: 4px;
    background: var(--surface, #16213e);
    color: var(--text, #e0e0e0);
    font-size: 13px;
    font-family: inherit;
  }
</style>
