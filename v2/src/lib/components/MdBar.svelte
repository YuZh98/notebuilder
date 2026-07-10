<script lang="ts">
  import { taWrap, taIns, doMd, SYMBOLS, MD_BUTTONS, COLOR_KEYS } from '../mdbar';

  let target = $state<HTMLTextAreaElement | null>(null);
  let left = $state(0);
  let top = $state(0);
  let bar = $state<HTMLDivElement | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function position(ta: HTMLTextAreaElement) {
    const r = ta.getBoundingClientRect();
    left = Math.max(6, Math.min(window.innerWidth - 260, r.left));
    top = Math.max(60, r.top - 40);
  }

  function onFocusIn(e: FocusEvent) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    // Focus hopping into the bar must NOT clear the grace timer: at focusin time the
    // blurred textarea may still be connected (CeText unmounts it on the next flush),
    // so only the grace re-check below can detect a stranded target reliably.
    if (bar && bar.contains(t)) return;
    if (t instanceof HTMLTextAreaElement && t.classList.contains('ce')) {
      clearTimeout(hideTimer);
      target = t;
      position(t);
    }
  }

  // 150ms grace so focus can hop into the bar (e.g. a <details> pad) without hiding it.
  // Captured `blur`, not `focusout`: CeText unmounts the textarea in its blur handler,
  // so the later focusout dispatches on a detached node and never reaches window.
  function onBlur() {
    if (!target) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const a = document.activeElement;
      if (!target?.isConnected || !a || (!a.closest('.ce') && !(bar && bar.contains(a)))) target = null;
    }, 150);
  }

  $effect(() => {
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('blur', onBlur, true);
    return () => {
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('blur', onBlur, true);
      clearTimeout(hideTimer);
    };
  });

  // Cancelling pointerdown keeps focus (and the blur-commit) on the textarea.
  function onBarPointerDown(e: PointerEvent) {
    if (e.target instanceof Element && e.target.closest('button,summary')) e.preventDefault();
  }
</script>

{#if target}
  {@const ta = target}
  <div
    id="mdbar"
    class="show"
    bind:this={bar}
    style="left:{left}px;top:{top}px"
    role="toolbar"
    tabindex="-1"
    aria-label="markdown formatting"
    onpointerdown={onBarPointerDown}
  >
    {#each MD_BUTTONS as [key, label] (key)}
      <button class="mdbtn" title={key} onclick={() => doMd(ta, key)}>{label}</button>
    {/each}
    <details class="mdpad">
      <summary title="symbols/emoji">Ω</summary>
      <div class="padgrid">
        {#each SYMBOLS as sym (sym)}
          <button class="symbtn" onclick={() => taIns(ta, sym)}>{sym}</button>
        {/each}
      </div>
    </details>
    <details class="mdpad">
      <summary title="color">🎨</summary>
      <div class="padgrid">
        {#each COLOR_KEYS as col (col)}
          <button class="colbtn" style="color:var(--{col})" onclick={() => taWrap(ta, `{c:${col}}`, '{/c}', 'text')}
            >A</button
          >
        {/each}
      </div>
    </details>
  </div>
{/if}
