<script lang="ts">
  import type { SliderProps } from './slider';
  import { clampSlider } from './slider';
  import type { Scope } from '../variable-graph';

  let {
    props,
    state = {},
    onState,
  }: {
    props: SliderProps;
    scope?: Scope;
    state?: Record<string, unknown>;
    onState?: (next: Record<string, unknown>) => void;
  } = $props();

  // Session-layer slot: `state` is the card's live scope keyed by variable name, wiped on
  // Study entry. `props.value` is the authored document default and is never written here.
  const value = $derived(
    typeof state[props.key] === 'number' ? (state[props.key] as number) : props.value,
  );

  const min = $derived(props.min ?? 0);
  const max = $derived(props.max ?? 100);
  const step = $derived(props.step ?? 1);

  const showName = $derived(props.showName !== false);
  const showValue = $derived(props.showValue !== false);
  const showSlider = $derived(props.showSlider !== false);

  // Free entry (showSlider:false) leaves the number box unbounded so any value can be typed.
  const numMin = $derived(showSlider ? min : undefined);
  const numMax = $derived(showSlider ? max : undefined);

  function set(raw: number) {
    onState?.({ [props.key]: clampSlider(props, Number.isFinite(raw) ? raw : value) });
  }
</script>

<div class="slider-study">
  {#if showName || showValue}
    <div class="row">
      {#if showName}<span class="key">{props.key}</span>{/if}
      {#if showValue}
        <input
          type="number"
          {value}
          min={numMin}
          max={numMax}
          {step}
          oninput={(e) => set(+(e.target as HTMLInputElement).value)}
        />
      {/if}
    </div>
  {/if}
  {#if showSlider}
    <input
      type="range"
      {value}
      {min}
      {max}
      {step}
      oninput={(e) => set(+(e.target as HTMLInputElement).value)}
    />
  {/if}
</div>

<style>
  .slider-study {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .key {
    font-family: ui-monospace, monospace;
    opacity: 0.7;
    font-size: 13px;
  }
  .row input {
    width: 6ch;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 2px 4px;
  }
  input[type='range'] {
    width: 100%;
  }
</style>
