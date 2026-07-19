<script lang="ts">
  import { pgShow, type ProgressProps } from './progress';

  // completion is passed by App outside the typed StudyComponent contract.
  // ProgressStudy declares it as a local optional prop; the registry stores
  // SlotType via type erasure (AnySlotType), so the extra prop is invisible
  // to the contract layer. App must cast when rendering this component.
  let { props, completion = { done: 0, total: 0, pct: 0 } } = $props<{
    props: ProgressProps;
    completion?: { done: number; total: number; pct: number };
  }>();

  const show = $derived(pgShow(props.show));
  const label = $derived(props.label ?? '');
  const pct = $derived(completion.pct);
</script>

<div class="progress-study">
  {#if label || show.mn || show.pct}
    <div class="row sm">
      {#if label}<span class="muted">{label}</span>{/if}
      {#if show.mn}<span class="pgbox">{completion.done} / {completion.total}</span>{/if}
      {#if show.pct}<span class="pgbox">{pct}%</span>{/if}
    </div>
  {/if}
  {#if show.bar}
    <div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i style="width: {pct}%"></i>
    </div>
  {/if}
</div>

<style>
  .progress-study {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row.sm {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .muted {
    opacity: 0.7;
  }

  /* .pgbox / .bar / .bar > i intentionally unscoped — the ported v1 rules in app.css own them. */
</style>
