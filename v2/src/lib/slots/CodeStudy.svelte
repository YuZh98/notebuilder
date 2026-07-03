<script lang="ts">
  let { props } = $props<{
    props: { code: string; lang?: string };
    scope?: Record<string, unknown>;
  }>();
</script>

<pre class="code-study"><code>{props.code}</code></pre>

<style>
  .code-study {
    margin: 0;
    padding: 12px;
    border: 1px solid var(--border, #2a2a4a);
    border-radius: 4px;
    background: var(--surface, #16213e);
    color: var(--text, #e0e0e0);
    overflow-x: auto;
    white-space: pre;
  }
  .code-study code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
  }
</style>
