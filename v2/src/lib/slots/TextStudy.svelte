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
</style>
