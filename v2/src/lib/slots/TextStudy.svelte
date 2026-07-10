<script lang="ts">
  import { renderMarkdown } from '../markdown';
  import type { Scope } from '../variable-graph';

  let { props, scope = {} } = $props<{
    props: { text: string };
    scope?: Scope;
  }>();
</script>

<div class="slot text text-study">
  {@html renderMarkdown(props.text, scope)}
</div>

<style>
  .text-study {
    line-height: 1.6;
    font-size: 14px;
  }
  .text-study :global(code) {
    background: var(--line);
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 13px;
  }
</style>
