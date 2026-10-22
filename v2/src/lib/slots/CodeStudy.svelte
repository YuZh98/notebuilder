<script lang="ts">
  import { highlightCode } from './highlight';

  let { props } = $props<{
    props: { code: string; lang?: string };
    scope?: Record<string, unknown>;
  }>();

  const tokens = $derived(highlightCode(props.code, props.lang));
</script>

<pre class="code-study"><code
    >{#each tokens as tok}{#if tok.cls}<span class={tok.cls}>{tok.text}</span>{:else}{tok.text}{/if}{/each}</code
  ></pre>

<style>
  .code-study {
    margin: 0;
    padding: var(--space-6);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel);
    color: var(--ink);
    overflow-x: auto;
    white-space: pre;
  }
  .code-study code {
    font-family: var(--mono);
    font-size: var(--fs-md);
    border: none;
    background: transparent;
    padding: 0;
  }
  .code-study .kw {
    color: var(--accent);
    font-weight: 600;
  }
  .code-study .str {
    color: var(--good);
  }
  .code-study .com {
    color: var(--muted);
    font-style: italic;
  }
  .code-study .num {
    color: var(--accent2);
  }
  .code-study .fn {
    color: var(--accent2);
  }
</style>
