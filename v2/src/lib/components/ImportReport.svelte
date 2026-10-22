<script lang="ts">
  /**
   * Import problems, readable: every error and warning with where it is, what is wrong and how
   * to fix it, plus a one-click "fix request" to paste back into the author's LLM. Props and
   * callbacks only — the host decides what Close means. `inline` drops the modal chrome so the
   * report can sit inside another dialog (FromAiModal). `fixRequest={false}` drops the AI fix
   * request, for problems in the open notebook (a held-back Share or Export) that no AI wrote.
   */
  import { onMount } from 'svelte';
  import { buildFixRequest, describeIssue, hintFor, humanPath, type HintedIssue } from '../import-hints';
  import { copyText } from '../clipboard';

  let {
    errors,
    warnings = [],
    title,
    inline = false,
    fixRequest: offerFix = true,
    onclose,
    oncopied,
  }: {
    errors: HintedIssue[];
    warnings?: HintedIssue[];
    title?: string;
    inline?: boolean;
    fixRequest?: boolean;
    onclose: () => void;
    oncopied?: (text: string) => void;
  } = $props();

  /** Long reports stay usable; the fix request still carries every issue. */
  const SHOW = 50;

  const heading = $derived(
    title ??
      (errors.length
        ? `This notebook can't be imported yet: ${errors.length} problem${errors.length === 1 ? '' : 's'}`
        : `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`),
  );
  const fixRequest = $derived(buildFixRequest(errors, warnings));
  type Row = { issue: HintedIssue; where: string; what: string; hint: string | null };
  const rows = (list: HintedIssue[]): Row[] =>
    list.slice(0, SHOW).map((issue) => ({ issue, ...describeIssue(issue), hint: hintFor(issue) }));
  const errorRows = $derived(rows(errors));
  const warningRows = $derived(rows(warnings));

  let copyState: 'idle' | 'copied' | 'failed' = $state('idle');
  let copyBtn: HTMLButtonElement | undefined = $state();
  let closeBtn: HTMLButtonElement | undefined = $state();
  const uid = $props.id();
  const headingId = `import-report-${uid}`;

  onMount(() => {
    if (!inline) (copyBtn ?? closeBtn)?.focus();
  });

  async function copyFix() {
    const text = fixRequest;
    if (await copyText(text)) {
      copyState = 'copied';
      oncopied?.(text);
      setTimeout(() => {
        if (copyState === 'copied') copyState = 'idle';
      }, 2500);
    } else {
      copyState = 'failed';
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (!inline && e.key === 'Escape') onclose();
  }}
/>

{#snippet issueList(list: Row[], kind: 'error' | 'warning')}
  <ol class="ir-list {kind}">
    {#each list as row, k (k)}
      <li class="ir-item" data-code={row.issue.code}>
        <div class="ir-where" title={row.where}>{humanPath(row.where)}</div>
        <div class="ir-what">{row.what}</div>
        {#if row.issue.excerpt}
          <pre class="ir-excerpt">{row.issue.excerpt}</pre>
        {/if}
        {#if row.hint}
          <div class="ir-hint"><b>Fix:</b> {row.hint}</div>
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

{#snippet body()}
  <h3 id={headingId} class="ir-title">{heading}</h3>
  {#if errorRows.length}
    {@render issueList(errorRows, 'error')}
    {#if errors.length > SHOW}<div class="muted sm">…and {errors.length - SHOW} more (all are in the fix request).</div>{/if}
  {/if}
  {#if warningRows.length}
    <div class="ir-sub">
      {errors.length ? 'Also' : 'It will load, but'}: {warnings.length} warning{warnings.length === 1 ? '' : 's'}
    </div>
    {@render issueList(warningRows, 'warning')}
    {#if warnings.length > SHOW}<div class="muted sm">…and {warnings.length - SHOW} more.</div>{/if}
  {/if}
  {#if copyState === 'failed'}
    <div class="ir-manual">
      <div class="sm">Couldn't reach the clipboard. Select this text and copy it:</div>
      <textarea readonly rows="6" value={fixRequest} onfocus={(e) => e.currentTarget.select()}></textarea>
    </div>
  {/if}
  <div class="row ir-actions">
    <span class="spacer"></span>
    {#if !inline}<button class={offerFix ? 'btn' : 'btn primary'} bind:this={closeBtn} onclick={onclose}>Close</button>{/if}
    {#if offerFix}
      <button class="btn primary" data-act="copy-fix" bind:this={copyBtn} onclick={copyFix}>
        {copyState === 'copied' ? 'Copied ✓' : 'Copy fix request for your AI'}
      </button>
    {/if}
    {#if inline}<button class="btn" onclick={onclose}>Close</button>{/if}
  </div>
{/snippet}

{#if inline}
  <section class="import-report inline" aria-labelledby={headingId}>
    {@render body()}
  </section>
{:else}
  <div class="modal import-report-modal" style="display:flex">
    <div class="modal-box import-report" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      {@render body()}
    </div>
  </div>
{/if}

<style>
  .import-report-modal {
    position: fixed;
    inset: 0;
    z-index: 85;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.55);
  }
  .import-report-modal .modal-box {
    max-width: 620px;
  }
  .import-report.inline {
    border: 1px solid color-mix(in srgb, var(--warn, #ff6b81) 45%, var(--line, #333));
    border-radius: 10px;
    padding: 10px 12px;
    margin: 8px 0;
    background: color-mix(in srgb, var(--warn, #ff6b81) 6%, transparent);
  }
  .ir-title {
    margin: 0 0 8px;
    font-size: 15px;
  }
  .ir-list {
    margin: 0 0 8px;
    padding-left: 22px;
    max-height: 46vh;
    overflow: auto;
  }
  .ir-item {
    margin: 0 0 8px;
  }
  .ir-where {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: var(--muted, #8a93ab);
  }
  .ir-list.error .ir-what {
    color: var(--warn, #ff6b81);
  }
  .ir-hint {
    font-size: 13px;
    margin-top: 2px;
  }
  .ir-excerpt {
    margin: 4px 0;
    padding: 6px 8px;
    font-size: 12px;
    line-height: 1.35;
    overflow-x: auto;
    background: var(--panel2, #0c1019);
    border-radius: 6px;
  }
  .ir-sub {
    font-weight: 600;
    font-size: 13px;
    margin: 6px 0 4px;
  }
  .ir-manual textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
  .ir-actions {
    margin-top: 10px;
    gap: 8px;
  }
</style>
