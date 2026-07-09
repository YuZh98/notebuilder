<script lang="ts">
  import type { ChoiceProps } from './choice';

  let { props, onUpdate } = $props<{
    props: ChoiceProps;
    onUpdate: (props: ChoiceProps) => void;
  }>();

  const answer = $derived(props.answer ?? []);

  function updateOption(idx: number, value: string) {
    const options = props.options.map((o: string, i: number) => (i === idx ? value : o));
    onUpdate({ ...props, options });
  }

  function addOption() {
    onUpdate({ ...props, options: [...props.options, ''] });
  }

  function removeOption(idx: number) {
    if (props.options.length <= 2) return;
    const options = props.options.filter((_: string, i: number) => i !== idx);
    const newAnswer = answer.filter((a: number) => a !== idx).map((a: number) => (a > idx ? a - 1 : a));
    onUpdate({ ...props, options, answer: newAnswer });
  }

  function toggleAnswer(idx: number) {
    const current = answer;
    if (props.multi ?? false) {
      const next = current.includes(idx)
        ? current.filter((a: number) => a !== idx)
        : [...current, idx];
      onUpdate({ ...props, answer: next });
    } else {
      onUpdate({ ...props, answer: current.includes(idx) ? [] : [idx] });
    }
  }

  function toggleMulti() {
    onUpdate({ ...props, multi: !(props.multi ?? false), answer: [] });
  }
</script>

<div class="choice-edit">
  <label class="multi-toggle">
    <input type="checkbox" checked={props.multi ?? false} onchange={toggleMulti} />
    Allow multiple correct answers
  </label>

  <ul>
    {#each props.options as option, idx (idx)}
      <li class="option-row">
        <input
          type={props.multi ? 'checkbox' : 'radio'}
          checked={answer.includes(idx)}
          onchange={() => toggleAnswer(idx)}
          title="Mark as correct"
        />
        <input
          type="text"
          value={option}
          placeholder={`Option ${idx + 1}`}
          oninput={(e) => updateOption(idx, (e.target as HTMLInputElement).value)}
          class="option-text"
        />
        <button
          class="remove"
          onclick={() => removeOption(idx)}
          disabled={props.options.length <= 2}
          aria-label="Remove option"
        >
          ×
        </button>
      </li>
    {/each}
  </ul>

  <button class="add" onclick={addOption}>+ Add option</button>
</div>

<style>
  .choice-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .multi-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    opacity: 0.85;
    cursor: pointer;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .option-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .option-text {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 13px;
    font-family: inherit;
  }

  .remove {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--ink);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    opacity: 0.6;
  }

  .remove:disabled {
    opacity: 0.2;
    cursor: default;
  }

  .remove:not(:disabled):hover {
    opacity: 1;
    border-color: #ef4444;
    color: #ef4444;
  }

  .add {
    align-self: flex-start;
    padding: 5px 12px;
    background: transparent;
    border: 1px dashed var(--line);
    border-radius: 4px;
    color: var(--ink);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    opacity: 0.7;
  }

  .add:hover {
    opacity: 1;
  }
</style>
