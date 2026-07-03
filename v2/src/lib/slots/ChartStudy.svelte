<script lang="ts">
  import type { ChartProps } from './chart';
  import { plotSVG } from './plot';
  import type { Scope } from '../variable-graph';

  let { props, scope = {} }: { props: ChartProps; scope?: Scope } = $props();

  const svg = $derived(plotSVG(props.fn, scope, props.x0 ?? 0, props.x1 ?? 10));
</script>

<div class="chart-study">
  {#if props.label}<div class="label">{props.label}</div>{/if}
  {@html svg}
</div>

<style>
  .chart-study {
    font-size: 13px;
  }
  .label {
    opacity: 0.7;
    margin-bottom: 4px;
  }
</style>
