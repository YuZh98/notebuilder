<script lang="ts">
  import type { ChoiceProps } from './choice';
  import { startPointerDrag, type EngineCallbacks } from '../drag/engine';
  import { reorderItems, remapAnswers } from '../drag/qopt-remap';
  import { pushGestureSnapshot } from '../drag/gesture-history';
  import { pushHistory } from '../history.svelte';

  let { props, onUpdate } = $props<{
    props: ChoiceProps;
    onUpdate: (props: ChoiceProps) => void;
  }>();

  const answer = $derived(props.answer ?? []);

  let listEl: HTMLElement | null = $state(null);

  // v1 90-drag-engine.js:103-105 — reorder the options, remap the correct-answer indices.
  const dragCallbacks: EngineCallbacks = {
    canDrag: () => true,
    canDrop: (_src, grid) => grid === listEl,
    onDrop: (src, t) => {
      if (t.kind !== 'grid') return;
      const from = Number(src.meta?.from);
      if (!Number.isInteger(from) || from < 0 || from >= props.options.length) return;
      const to = Math.max(0, Math.min(t.idx, props.options.length - 1));
      pushGestureSnapshot();
      onUpdate({
        ...props,
        options: reorderItems(props.options, from, to),
        answer: remapAnswers(answer, from, to),
      });
    },
    phWidth: () => 8,
  };

  function gripDown(ev: PointerEvent, from: number) {
    const row = (ev.currentTarget as Element).closest('[data-qrow]');
    if (!row) return;
    ev.preventDefault();
    ev.stopPropagation();
    startPointerDrag({ kind: 'qopt', id: 'options', srcEl: row, meta: { key: 'options', from } }, ev, dragCallbacks);
  }

  function updateOption(idx: number, value: string) {
    const options = props.options.map((o: string, i: number) => (i === idx ? value : o));
    onUpdate({ ...props, options });
  }

  function addOption() {
    pushHistory();
    onUpdate({ ...props, options: [...props.options, ''] });
  }

  function removeOption(idx: number) {
    if (props.options.length <= 2) return;
    pushHistory();
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

  function updateQ(value: string) {
    onUpdate({ ...props, q: value });
  }

  function updateExplanation(value: string) {
    onUpdate({ ...props, explanation: value });
  }
</script>

<div class="choice-edit">
  <input
    class="choice-q-input"
    type="text"
    value={props.q ?? ''}
    placeholder="question (optional · markdown + $math$)"
    oninput={(e) => updateQ((e.target as HTMLInputElement).value)}
  />

  <label class="multi-toggle">
    <input type="checkbox" checked={props.multi ?? false} onchange={toggleMulti} />
    Allow multiple correct answers
  </label>

  <ul class="ce-choice" bind:this={listEl}>
    {#each props.options as option, idx (idx)}
      <li class="option-row ce-opt" data-qrow>
        <span class="ce-opt-grip" role="presentation" onpointerdown={(e) => gripDown(e, idx)}>⋮⋮</span>
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

  <input
    class="choice-exp-input"
    type="text"
    value={props.explanation ?? ''}
    placeholder="explanation — shown after answering (optional)"
    oninput={(e) => updateExplanation((e.target as HTMLInputElement).value)}
  />
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

  .choice-q-input,
  .choice-exp-input {
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 13px;
    font-family: inherit;
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
