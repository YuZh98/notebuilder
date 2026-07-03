<script lang="ts">
  import type { ComputeProps } from './compute';
  import { evalExpr } from '../expr';
  import type { Scope } from '../variable-graph';

  let { props, scope = {} }: { props: ComputeProps; scope?: Scope } = $props();

  const value = $derived.by(() => {
    const v = evalExpr(props.expr, scope);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : '—';
  });
</script>

<div class="compute-study">
  {#if props.note}<span class="note">{props.note}</span> {/if}<b class="val">{value}</b>
</div>

<style>
  .compute-study {
    font-size: 14px;
  }
  .note {
    opacity: 0.7;
  }
  .val {
    font-family: ui-monospace, monospace;
    color: var(--accent, #6ea8fe);
  }
</style>
