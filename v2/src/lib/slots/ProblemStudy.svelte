<script lang="ts">
  import { untrack } from 'svelte';
  import {
    instantiate,
    freshLast,
    readProblemState,
    nextSeed,
    isCorrect,
    formatAnswer,
    needOf,
    tolOf,
    paramsOf,
    type ProblemProps,
  } from './problem';
  import { parseNumericInput } from '../numeric-input';
  import { renderMarkdown } from '../markdown';
  import type { Scope } from '../variable-graph';

  // `state` is renamed locally: a binding called `state` would turn `$state(...)` into a store read.
  let { props, scope = {}, state: saved = {}, onState } = $props<{
    props: ProblemProps;
    scope?: Scope;
    state?: Record<string, unknown>;
    onState?: (next: Record<string, unknown>) => void;
  }>();

  // Values are redrawn from the stored seed on every render — never stored themselves.
  const st = $derived(readProblemState(saved));
  const inst = $derived(instantiate(props, scope, st.seed));
  // Params shadow card variables inside this slot only.
  const local = $derived({ ...scope, ...inst.values });
  const need = $derived(needOf(props));
  const hasParams = $derived(paramsOf(props).length > 0);
  // A ✓ only stands while the answer it matched still holds (a slider may have moved since).
  const last = $derived(freshLast(props, inst, st.last));
  const solved = $derived(last?.ok === true);
  const revealed = $derived(solved || st.revealed === true);
  const locked = $derived(!inst.ok || revealed);
  const done = $derived(st.correct >= need);

  // Transient typing buffer; seeded once from the last checked input so a reload shows it.
  let draft = $state(untrack(() => readProblemState(saved).last?.input ?? ''));
  let inputError = $state('');

  function check() {
    if (locked || !inst.ok) return;
    const parsed = parseNumericInput(draft);
    if (!parsed.ok) {
      inputError = parsed.error;
      return;
    }
    inputError = '';
    const ok = isCorrect(inst.answer, parsed.value, tolOf(props));
    onState?.({
      ...saved,
      seed: st.seed,
      correct: st.correct + (ok ? 1 : 0),
      attempts: st.attempts + 1,
      last: { input: draft.trim(), ok },
    });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      check();
    }
  }

  function newNumbers() {
    const { last: _last, revealed: _revealed, ...rest } = saved;
    const seed = nextSeed(props, scope, st.seed);
    draft = '';
    inputError = '';
    onState?.({ ...rest, seed, correct: st.correct, attempts: st.attempts });
  }

  function showAnswer() {
    if (locked) return;
    onState?.({ ...saved, seed: st.seed, correct: st.correct, attempts: st.attempts, revealed: true });
  }
</script>

<div class="problem-study">
  <div class="problem-prompt">
    {@html renderMarkdown(typeof props.prompt === 'string' ? props.prompt : '', local)}
  </div>

  {#if !inst.ok}
    <p class="problem-error" role="alert">{inst.error}</p>
  {:else}
    <div class="problem-row">
      <!-- No inputmode: decimal keypads can lack "-", "/" or "." (iOS), and answers need all three. -->
      <input
        class="problem-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-label="Your answer"
        aria-invalid={inputError ? 'true' : undefined}
        value={draft}
        disabled={locked}
        oninput={(e) => {
          draft = (e.currentTarget as HTMLInputElement).value;
          inputError = '';
        }}
        onkeydown={onKey}
      />
      <button class="problem-check" onclick={check} disabled={locked}>Check</button>
    </div>
    {#if inputError}
      <p class="problem-input-error" role="alert">{inputError}</p>
    {/if}
    <div class="problem-feedback" aria-live="polite">
      {#if last?.ok}
        <span class="problem-ok">✓ Correct</span>
      {:else if last}
        <span class="problem-bad">✗ {last.input} is not right — try again</span>
      {/if}
      {#if revealed}
        <span class="problem-answer">Answer: <b>{formatAnswer(inst.answer)}</b></span>
      {/if}
    </div>
  {/if}

  <div class="problem-foot">
    <span class="problem-streak" class:done>
      {Math.min(st.correct, need)} / {need} correct{done ? ' ✓' : ''}
    </span>
    {#if inst.ok && !revealed}
      <button class="problem-show" onclick={showAnswer}>Show answer</button>
    {/if}
    {#if inst.ok && (hasParams || revealed)}
      <button class="problem-new" onclick={newNumbers}>{hasParams ? 'New numbers' : 'Try again'}</button>
    {/if}
  </div>

  {#if inst.ok && revealed && typeof props.explain === 'string' && props.explain.trim()}
    <div class="problem-explain">{@html renderMarkdown(props.explain, local)}</div>
  {/if}
</div>

<style>
  .problem-study {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .problem-prompt {
    font-weight: 600;
    line-height: 1.5;
  }

  .problem-row {
    display: flex;
    gap: 6px;
  }

  .problem-input {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 14px;
    font-family: ui-monospace, monospace;
  }

  .problem-input[aria-invalid='true'] {
    border-color: #ef4444;
  }

  .problem-check {
    padding: 6px 16px;
    background: var(--accent, #7c3aed);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
  }

  .problem-check:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .problem-input-error,
  .problem-error {
    margin: 0;
    font-size: 12px;
    color: #f87171;
  }

  .problem-feedback {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 13px;
    min-height: 1em;
  }

  .problem-ok {
    color: #22c55e;
  }

  .problem-bad {
    color: #f87171;
  }

  .problem-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .problem-streak {
    opacity: 0.75;
    margin-right: auto;
  }

  .problem-streak.done {
    color: #22c55e;
    opacity: 1;
  }

  .problem-show,
  .problem-new {
    padding: 3px 10px;
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--ink);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .problem-explain {
    font-size: 13px;
    opacity: 0.85;
    border-left: 2px solid var(--line);
    padding-left: 8px;
  }
</style>
