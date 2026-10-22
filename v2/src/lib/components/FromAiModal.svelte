<script lang="ts">
  /**
   * New notebook "From AI" (D2): 1) describe the notebook and copy a complete prompt for any chat
   * AI; 2) paste the reply, Check it (fences and chatter tolerated), fix via ImportReport's
   * copyable fix request, and Create. Props and callbacks only: the host turns the JSON into a
   * notebook (`oncreate`) and owns closing.
   */
  import { onMount } from 'svelte';
  import ImportReport from './ImportReport.svelte';
  import { buildAiPrompt } from '../ai-prompt';
  import { checkNotebookText, notebookSummary, type CheckResult } from '../import-hints';
  import { copyText } from '../clipboard';
  import type { NotebookJSON } from '../json-io';

  let {
    onclose,
    oncreate,
    oncopied,
  }: {
    onclose: () => void;
    oncreate: (json: NotebookJSON) => void;
    /** Optional: tell the host something reached the clipboard (e.g. to toast). */
    oncopied?: (what: 'prompt' | 'fix', text: string) => void;
  } = $props();

  let topic = $state('');
  let audience = $state('');
  let cards = $state('');
  let promptCopy: 'idle' | 'copied' | 'failed' = $state('idle');
  let showPrompt = $state(false);
  let reply = $state('');
  // raw, not deep state: the parsed JSON goes to the host as plain data (a $state proxy would
  // leak into the new notebook and break structuredClone downstream).
  let result = $state.raw<CheckResult | null>(null);
  let hideWarnings = $state(false);
  let topicInput: HTMLInputElement | undefined = $state();
  // Escape is asking "Discard what you typed?"; refocus is where focus was, for Keep editing.
  let confirmDiscard = $state(false);
  let refocus: HTMLElement | null = null;

  const uid = $props.id();
  const cardCount = $derived(cards.trim() ? Number(cards) : undefined);
  const prompt = $derived(buildAiPrompt({ topic, audience, cards: cardCount }));
  const canCopy = $derived(topic.trim().length > 0);
  const typed = $derived([topic, audience, cards, reply].some((v) => v.trim()));
  const summary = $derived(result?.ok ? notebookSummary(result.json) : null);
  const summaryText = $derived.by(() => {
    if (!summary) return '';
    const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
    return [
      n(summary.sections, 'section'),
      summary.chapters ? n(summary.chapters, 'chapter') : '',
      n(summary.cards, 'card'),
      summary.quizzes ? n(summary.quizzes, 'quiz card') : '',
      summary.flashcards ? n(summary.flashcards, 'flashcard') : '',
      summary.interactive ? n(summary.interactive, 'interactive card') : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

  onMount(() => topicInput?.focus());

  function setTopic(v: string) {
    topic = v;
    promptCopy = 'idle';
  }

  async function copyPrompt() {
    if (!canCopy) return;
    const text = prompt;
    if (await copyText(text)) {
      promptCopy = 'copied';
      oncopied?.('prompt', text);
    } else {
      promptCopy = 'failed';
      showPrompt = true;
    }
  }

  function setReply(v: string) {
    reply = v;
    result = null; // a check result is stale the moment the reply changes
  }

  function check() {
    result = checkNotebookText(reply);
    hideWarnings = false;
  }

  function create() {
    if (result?.ok) oncreate(result.json as NotebookJSON);
  }

  /**
   * Escape never silently throws away a pasted reply: with anything typed it asks first, and a
   * second Escape (or Discard) closes. Mid-IME-composition Escape belongs to the input method,
   * and a held-down key's auto-repeat never answers its own question.
   */
  function onEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.repeat) return;
    if (!typed || confirmDiscard) return onclose();
    refocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmDiscard = true;
  }

  function keepEditing() {
    confirmDiscard = false;
    refocus?.focus();
  }

  /** The dialog scrolls: a question asked below the fold would let the next Escape answer it unseen. */
  function reveal(el: HTMLElement) {
    el.scrollIntoView?.({ block: 'nearest' });
  }
</script>

<svelte:window onkeydown={onEscape} />

<div class="modal fromai-modal" style="display:flex">
  <div
    class="modal-box fromai"
    role="dialog"
    aria-modal="true"
    aria-labelledby="{uid}-title"
    oninput={() => (confirmDiscard = false)}
  >
    <h3 id="{uid}-title" class="fa-title">✨ New notebook from AI</h3>
    <p class="muted sm fa-lead">
      Works with any chat AI (ChatGPT, Claude, Gemini, …): copy a prompt, paste the reply, check it, create.
    </p>

    <section class="fa-step" aria-labelledby="{uid}-s1">
      <h4 id="{uid}-s1">1 · Describe it and copy the prompt</h4>
      <label class="fa-field">
        <span>Topic</span>
        <input
          data-fa="topic"
          bind:this={topicInput}
          value={topic}
          placeholder="e.g. Bayes' theorem with medical-test examples"
          oninput={(e) => setTopic(e.currentTarget.value)}
          onkeydown={(e) => {
            if (e.key === 'Enter') void copyPrompt();
          }}
        />
      </label>
      <label class="fa-field">
        <span>Audience <em class="muted">(optional)</em></span>
        <input
          data-fa="audience"
          value={audience}
          placeholder="e.g. first-year nursing students"
          oninput={(e) => {
            audience = e.currentTarget.value;
            promptCopy = 'idle';
          }}
        />
      </label>
      <label class="fa-field">
        <span>About how many cards <em class="muted">(optional)</em></span>
        <input
          data-fa="cards"
          type="number"
          min="1"
          max="60"
          value={cards}
          style="width:6em"
          oninput={(e) => {
            cards = e.currentTarget.value;
            promptCopy = 'idle';
          }}
        />
      </label>
      <div class="row fa-row">
        <button class="btn primary" data-act="copy-prompt" disabled={!canCopy} onclick={copyPrompt}>
          {promptCopy === 'copied' ? 'Prompt copied ✓' : 'Copy prompt'}
        </button>
        <button class="btn sm ghost" data-act="toggle-prompt" aria-expanded={showPrompt} onclick={() => (showPrompt = !showPrompt)}>
          {showPrompt ? 'Hide prompt' : 'Show prompt'}
        </button>
      </div>
      {#if promptCopy === 'copied'}
        <div class="sm fa-note">Paste it into your AI chat, then paste the AI's whole reply below.</div>
      {:else if promptCopy === 'failed'}
        <div class="sm fa-note fa-warn">Couldn't reach the clipboard: select the prompt below and copy it.</div>
      {/if}
      {#if showPrompt}
        <textarea class="fa-mono" data-fa="prompt" readonly rows="8" value={prompt} aria-label="AI prompt"></textarea>
      {/if}
    </section>

    <section class="fa-step" aria-labelledby="{uid}-s2">
      <h4 id="{uid}-s2">2 · Paste the AI's reply</h4>
      <textarea
        class="fa-mono"
        data-fa="reply"
        rows="8"
        value={reply}
        aria-label="AI reply"
        placeholder="Paste the whole reply here (```json fences and chatter around it are fine)."
        oninput={(e) => setReply(e.currentTarget.value)}
      ></textarea>
      <div class="row fa-row">
        <button class="btn" data-act="check" disabled={!reply.trim()} onclick={check}>Check</button>
      </div>
      {#if result && !result.ok}
        <ImportReport
          inline
          errors={result.errors}
          warnings={result.warnings}
          onclose={() => (result = null)}
          oncopied={(text) => oncopied?.('fix', text)}
        />
      {:else if result && summary}
        <div class="fa-ok" data-fa="summary" role="status">
          ✓ Looks good: <b>{summary.name || 'Untitled'}</b> — {summaryText}
        </div>
        {#if result.warnings.length && !hideWarnings}
          <ImportReport
            inline
            errors={[]}
            warnings={result.warnings}
            title="You can create it, but check these first"
            onclose={() => (hideWarnings = true)}
            oncopied={(text) => oncopied?.('fix', text)}
          />
        {/if}
      {/if}
    </section>

    {#if confirmDiscard}
      <div class="row fa-discard" data-fa="discard" role="alert" {@attach reveal}>
        <span>Discard what you typed? <span class="muted">Esc again discards it.</span></span>
        <span class="spacer"></span>
        <button class="btn sm" data-act="keep" onclick={keepEditing}>Keep editing</button>
        <button class="btn sm" data-act="discard" onclick={onclose}>Discard</button>
      </div>
    {/if}

    <div class="row fa-actions">
      <span class="spacer"></span>
      <button class="btn" data-act="cancel" onclick={onclose}>Cancel</button>
      <button class="btn primary" data-act="create" disabled={!result?.ok} onclick={create}>Create notebook</button>
    </div>
  </div>
</div>

<style>
  .fromai-modal {
    position: fixed;
    inset: 0;
    z-index: 80;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.55);
  }
  .fromai-modal .modal-box {
    max-width: 680px;
  }
  .fa-title {
    margin: 0 0 4px;
  }
  .fa-lead {
    margin: 0 0 10px;
  }
  .fa-step {
    border-top: 1px solid var(--line, #222a3d);
    padding-top: 8px;
    margin-top: 8px;
  }
  .fa-step h4 {
    margin: 0 0 6px;
    font-size: 13px;
  }
  .fa-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 0 6px;
    font-size: 13px;
  }
  .fa-field input:not([type='number']) {
    width: 100%;
    box-sizing: border-box;
  }
  .fa-row {
    gap: 8px;
    margin: 4px 0;
  }
  .fa-note {
    margin: 2px 0 4px;
  }
  .fa-warn {
    color: var(--warn, #ff6b81);
  }
  .fa-mono {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
  .fa-ok {
    margin: 8px 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--good, #54d6a0) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--good, #54d6a0) 45%, transparent);
  }
  .fa-actions {
    margin-top: 12px;
    gap: 8px;
  }
  .fa-discard {
    margin-top: 12px;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    border: 1px solid color-mix(in srgb, var(--warn, #ff6b81) 45%, transparent);
  }
</style>
