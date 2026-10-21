<script lang="ts">
  import {
    problemIssues,
    problemWarnings,
    instantiate,
    formatAnswer,
    DEFAULT_SEED,
    type ProblemProps,
    type ProblemParam,
  } from './problem';
  import { EXPR_BUILTINS } from '../expr';
  import { pushHistory } from '../history.svelte';
  import type { Scope } from '../variable-graph';

  let { props, onUpdate, scope = {} } = $props<{
    props: ProblemProps;
    onUpdate: (props: ProblemProps) => void;
    scope?: Scope;
  }>();

  const params = $derived<ProblemParam[]>(Array.isArray(props.params) ? props.params : []);
  const issues = $derived(problemIssues(props, new Set(Object.keys(scope))));
  // Valid but probably unintended (-a^2 is (-a)^2): said here, never held against Share/Export.
  const warnings = $derived(problemWarnings(props));
  // What a student sees first (the default seed), so the author can sanity-check the formula.
  const preview = $derived(instantiate(props, scope, DEFAULT_SEED));
  const previewText = $derived(
    preview.ok
      ? [
          ...Object.entries(preview.values).map(([k, v]) => `${k} = ${v}`),
          `answer = ${formatAnswer(preview.answer)}`,
        ].join(', ')
      : '',
  );

  const text = (e: Event): string => (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;

  /** A finite number from a number field, or null while it is empty or half-typed (then nothing is emitted). */
  function num(e: Event): number | null {
    const raw = text(e).trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function setField<K extends keyof ProblemProps>(k: K, v: ProblemProps[K]) {
    onUpdate({ ...props, [k]: v });
  }

  function setNum(k: 'tol' | 'need', e: Event) {
    const n = num(e);
    if (n !== null) setField(k, n);
  }

  function setParam(i: number, patch: Partial<ProblemParam>) {
    onUpdate({ ...props, params: params.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  }

  function setParamNum(i: number, k: 'min' | 'max' | 'step', e: Event) {
    const n = num(e);
    if (n !== null) setParam(i, { [k]: n });
  }

  function freeName(): string {
    const used = new Set(params.map((p) => p.name));
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      if (!used.has(c) && !EXPR_BUILTINS.has(c)) return c;
    }
    let i = 1;
    while (used.has(`p${i}`)) i++;
    return `p${i}`;
  }

  function addParam() {
    pushHistory();
    onUpdate({ ...props, params: [...params, { name: freeName(), min: 1, max: 10, step: 1 }] });
  }

  function removeParam(i: number) {
    pushHistory();
    onUpdate({ ...props, params: params.filter((_, j) => j !== i) });
  }
</script>

<div class="problem-edit">
  <label class="field">
    <span>Prompt</span>
    <textarea
      rows="2"
      value={props.prompt ?? ''}
      placeholder={'What is {{a}} × {{b}}? (markdown + $math$)'}
      oninput={(e) => setField('prompt', text(e))}
    ></textarea>
  </label>

  <table class="problem-params">
    <thead>
      <tr><th>Parameter</th><th>Min</th><th>Max</th><th>Step</th><th><span class="sr">Remove</span></th></tr>
    </thead>
    <tbody>
      {#each params as p, i (i)}
        <tr class="problem-param">
          <td>
            <input
              class="pname"
              aria-label={`Parameter ${i + 1} name`}
              value={p.name ?? ''}
              oninput={(e) => setParam(i, { name: text(e).trim() })}
            />
          </td>
          <td>
            <input type="number" aria-label={`Parameter ${i + 1} min`} value={p.min} oninput={(e) => setParamNum(i, 'min', e)} />
          </td>
          <td>
            <input type="number" aria-label={`Parameter ${i + 1} max`} value={p.max} oninput={(e) => setParamNum(i, 'max', e)} />
          </td>
          <td>
            <input
              type="number"
              min="0"
              step="any"
              aria-label={`Parameter ${i + 1} step`}
              value={p.step ?? 1}
              oninput={(e) => setParamNum(i, 'step', e)}
            />
          </td>
          <td>
            <button class="remove" aria-label={`Remove parameter ${p.name || i + 1}`} onclick={() => removeParam(i)}>×</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="add" onclick={addParam}>+ Add parameter</button>

  <label class="field">
    <span>Answer =</span>
    <input
      class="mono"
      aria-label="Answer formula"
      value={props.answer ?? ''}
      placeholder="e.g. a*b"
      oninput={(e) => setField('answer', text(e))}
    />
  </label>

  <div class="row">
    <label class="field">
      <span>Tolerance ±</span>
      <input type="number" min="0" step="any" value={props.tol ?? 0} oninput={(e) => setNum('tol', e)} />
    </label>
    <label class="field">
      <span>Correct answers needed</span>
      <input type="number" min="1" step="1" value={props.need ?? 1} oninput={(e) => setNum('need', e)} />
    </label>
  </div>

  <label class="field">
    <span>Explanation</span>
    <textarea
      rows="2"
      value={props.explain ?? ''}
      placeholder="shown after a correct answer or “Show answer” (optional)"
      oninput={(e) => setField('explain', text(e))}
    ></textarea>
  </label>

  {#if previewText}
    <p class="problem-preview">First draw: {previewText}</p>
  {/if}
  {#if warnings.length > 0}
    <ul class="problem-warnings">
      {#each warnings as msg, i (i)}
        <li>{msg}</li>
      {/each}
    </ul>
  {/if}
  {#if issues.length > 0}
    <ul class="problem-issues">
      {#each issues as msg, i (i)}
        <li>{msg}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .problem-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }

  .field {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .field span {
    flex-shrink: 0;
    min-width: 72px;
    padding-top: 5px;
    opacity: 0.7;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  input,
  textarea {
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 13px;
    font-family: inherit;
    box-sizing: border-box;
  }

  .field textarea,
  .field .mono {
    flex: 1;
    min-width: 0;
  }

  .field input[type='number'] {
    width: 8ch;
  }

  .mono,
  .pname {
    font-family: ui-monospace, monospace;
  }

  textarea {
    resize: vertical;
  }

  .problem-params {
    border-collapse: collapse;
    width: 100%;
    /* fixed layout keeps the table inside narrow slots instead of overflowing */
    table-layout: fixed;
  }

  .problem-params th:last-child {
    width: 34px;
  }

  .problem-params th {
    text-align: left;
    font-weight: 500;
    opacity: 0.6;
    font-size: 12px;
    padding: 0 4px 2px;
  }

  .problem-params td {
    padding: 2px 4px;
  }

  .problem-params input {
    width: 100%;
    min-width: 0;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .remove {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--ink);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.6;
  }

  .remove:hover {
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

  .problem-preview {
    margin: 0;
    font-size: 12px;
    opacity: 0.7;
    font-family: ui-monospace, monospace;
  }

  .problem-issues,
  .problem-warnings {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    color: #f87171;
  }

  .problem-warnings {
    color: #d97706;
  }
</style>
