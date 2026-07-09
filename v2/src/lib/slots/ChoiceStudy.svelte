<script lang="ts">
  import type { ChoiceProps } from './choice';

  let { props, state = {}, onState } = $props<{
    props: ChoiceProps;
    state?: Record<string, unknown>;
    onState?: (next: Record<string, unknown>) => void;
  }>();

  const multi = $derived(props.multi ?? false);
  const answer = $derived(props.answer ?? []);

  const selected = $derived(
    Array.isArray(state.selected) ? (state.selected as number[]) : []
  );
  const submitted = $derived(state.submitted === true);

  function toggle(idx: number) {
    if (submitted) return;
    if (multi) {
      const next = selected.includes(idx)
        ? selected.filter((i) => i !== idx)
        : [...selected, idx];
      onState?.({ ...state, selected: next });
    } else {
      onState?.({ ...state, selected: [idx] });
    }
  }

  function submit() {
    if (submitted) return;
    onState?.({ ...state, submitted: true });
  }

  function optionClass(idx: number): string {
    if (!submitted) return selected.includes(idx) ? 'option selected' : 'option';
    const isSelected = selected.includes(idx);
    const isCorrect = answer.includes(idx);
    if (isSelected && isCorrect) return 'option correct';
    if (isSelected && !isCorrect) return 'option incorrect';
    if (!isSelected && isCorrect) return 'option missed';
    return 'option';
  }
</script>

<div class="choice-study">
  <ul>
    {#each props.options as option, idx (idx)}
      <li>
        <button
          class={optionClass(idx)}
          onclick={() => toggle(idx)}
          disabled={submitted}
          aria-pressed={selected.includes(idx)}
        >
          {option}
        </button>
      </li>
    {/each}
  </ul>
  {#if !submitted}
    <button class="submit" onclick={submit} disabled={selected.length === 0}>
      Submit
    </button>
  {/if}
</div>

<style>
  .choice-study {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .option {
    width: 100%;
    padding: 8px 12px;
    text-align: left;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
  }

  .option:disabled {
    cursor: default;
  }

  .option.selected {
    border-color: var(--accent, #7c3aed);
    background: color-mix(in srgb, var(--accent, #7c3aed) 15%, var(--panel));
  }

  .option.correct {
    border-color: #22c55e;
    background: color-mix(in srgb, #22c55e 15%, var(--panel));
    color: #86efac;
  }

  .option.incorrect {
    border-color: #ef4444;
    background: color-mix(in srgb, #ef4444 15%, var(--panel));
    color: #fca5a5;
  }

  .option.missed {
    border-color: #22c55e;
    opacity: 0.6;
  }

  .submit {
    align-self: flex-start;
    padding: 6px 16px;
    background: var(--accent, #7c3aed);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
  }

  .submit:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
