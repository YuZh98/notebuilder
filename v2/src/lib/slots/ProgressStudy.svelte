<script lang="ts">
  import type { ProgressProps } from './progress';

  // completion is passed by App outside the typed StudyComponent contract.
  // ProgressStudy declares it as a local optional prop; the registry stores
  // SlotType via type erasure (AnySlotType), so the extra prop is invisible
  // to the contract layer. App must cast when rendering this component.
  let { props, completion = { done: 0, total: 0, pct: 0 } } = $props<{
    props: ProgressProps;
    completion?: { done: number; total: number; pct: number };
  }>();

  const show = $derived(props.show ?? {});
  const label = $derived(props.label ?? 'Progress');
  const pct = $derived(completion.pct);
</script>

<div class="progress-study">
  <span class="label">{label}</span>
  <div class="meter">
    {#if show.mn ?? true}
      <span class="mn">{completion.done}/{completion.total}</span>
    {/if}
    {#if show.pct ?? true}
      <span class="pct">{pct}%</span>
    {/if}
    {#if show.bar ?? true}
      <div class="bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div class="bar-fill" style="width: {pct}%"></div>
      </div>
    {/if}
  </div>
</div>

<style>
  .progress-study {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-size: 13px;
    opacity: 0.7;
  }

  .meter {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .mn,
  .pct {
    font-size: 13px;
    min-width: 40px;
  }

  .bar-track {
    flex: 1;
    height: 8px;
    background: var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--accent, #7c3aed);
    border-radius: 4px;
    transition: width 0.2s ease;
  }
</style>
