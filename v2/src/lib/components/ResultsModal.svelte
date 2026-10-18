<script lang="ts">
  import { onMount } from 'svelte';
  import { buildResults, formatResultsText, type Results } from '../results';
  import { toast } from '../toast.svelte';
  import type { ReaderStateMap } from '../reader-store';
  import type { Notebook } from '../types';

  // A student's own results (D1d): read-only over the reader layer; everything stays on this
  // machine — Copy goes to the clipboard, Download is a local blob. Nothing is sent anywhere.
  let {
    notebook,
    readerState,
    docId,
    onclose,
    onreset,
  }: {
    notebook: Notebook;
    readerState: ReaderStateMap;
    docId: string;
    onclose: () => void;
    onreset?: () => void;
  } = $props();

  let student = $state('');
  let showText = $state(false);
  let box: HTMLElement | null = $state(null);

  const results = $derived(buildResults(notebook, readerState, { docId, student, now: new Date() }));
  const graded = $derived(results.graded);

  // Exports are stamped at the moment of the click, not when the dialog opened.
  const fresh = (): Results => buildResults(notebook, readerState, { docId, student, now: new Date() });

  onMount(() => box?.focus());

  function legacyCopy(text: string): boolean {
    if (typeof document.execCommand !== 'function') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  async function copy() {
    const text = formatResultsText(fresh());
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = legacyCopy(text);
    // When no copy path works (file:// pages may lack clipboard access), show the text to select.
    showText = !ok;
    toast(ok ? 'results copied — paste them to your teacher' : 'couldn’t copy — select the text below', 3000);
  }

  // Keep download names portable: no path separators or characters filesystems reject.
  const safe = (s: string): string =>
    s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  function download() {
    const r = fresh();
    const data = JSON.stringify({ format: 'notebuilder-results', version: 1, ...r }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${[safe(r.notebook) || 'notebook', 'results', r.student ? safe(r.student) : ''].filter(Boolean).join(' - ')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }

  const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="modal results-modal" style="display:flex" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div
    class="modal-box"
    role="dialog"
    aria-modal="true"
    aria-labelledby="results-title"
    tabindex="-1"
    bind:this={box}
    onkeydown={onKey}
  >
    <h3 id="results-title" style="margin:0 0 4px">📊 My results</h3>
    <div class="muted sm">{results.notebook}</div>

    <label class="results-name">
      <span class="sm">Your name <span class="muted">(optional)</span></span>
      <input
        data-results="name"
        type="text"
        autocomplete="name"
        value={student}
        oninput={(e) => (student = e.currentTarget.value)}
      />
    </label>

    <div class="results-row">
      <strong>Progress</strong>
      <span data-results="progress">
        {results.overall.done} of {results.overall.total} cards done ({results.overall.pct}%)
      </span>
    </div>
    <div class="results-bar" role="progressbar" aria-valuenow={results.overall.pct} aria-valuemin={0} aria-valuemax={100}>
      <i style="width:{results.overall.pct}%"></i>
    </div>

    <div class="results-row">
      <strong>Graded</strong>
      <span data-results="graded">
        {#if graded.items === 0}
          no auto-graded questions
        {:else}
          {graded.correct} of {graded.answered} answered correct{#if graded.answered > 0}&nbsp;({pctOf(graded.correct, graded.answered)}%){/if}
          · {graded.items} question{graded.items === 1 ? '' : 's'}
        {/if}
      </span>
    </div>

    {#if results.perSection.length > 0}
      <ul class="results-sections">
        {#each results.perSection as s, i (i)}
          <li><span>{s.title ?? s.name}</span><span class="muted">{s.done}/{s.total}</span></li>
        {/each}
      </ul>
    {/if}

    {#if showText}
      <textarea
        data-results="text"
        class="results-text"
        aria-label="Results as text"
        readonly
        rows="8"
        value={formatResultsText(results)}
      ></textarea>
    {/if}

    <div class="row" style="margin-top:14px">
      <button class="btn primary" data-act="copy-results" onclick={copy}>Copy</button>
      <button class="btn" data-act="download-results" onclick={download}>⤓ Download .json</button>
      <div class="spacer"></div>
      <button class="btn" data-act="close-results" onclick={onclose}>Close</button>
    </div>
    <div class="row" style="margin-top:10px">
      <span class="muted sm">Stays on this device — send it to your teacher yourself.</span>
      <div class="spacer"></div>
      {#if onreset}
        <button
          class="btn sm warn results-reset"
          data-act="reset-progress"
          title="Clear your saved answers and notes for this notebook"
          onclick={onreset}
        >Reset my progress</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .results-modal {
    position: fixed;
    inset: 0;
    z-index: 80;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.55);
  }
  .modal-box:focus {
    outline: none;
  }
  .results-reset {
    flex: none;
    white-space: nowrap;
  }
  .results-name {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 12px 0;
  }
  .results-name input,
  .results-text {
    background: var(--panel2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 6px 8px;
    font: inherit;
  }
  .results-text {
    width: 100%;
    box-sizing: border-box;
    margin-top: 10px;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .results-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 6px 0 4px;
    font-size: 13px;
  }
  .results-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
    margin-bottom: 8px;
  }
  .results-bar i {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .results-sections {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    font-size: 12px;
  }
  .results-sections li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    border-top: 1px solid var(--line);
  }
</style>
