<script lang="ts">
  import type { SliderProps } from './slider';
  import { clampSlider } from './slider';
  import type { Scope } from '../variable-graph';

  let { props = $bindable() }: { props: SliderProps; scope?: Scope } = $props();

  const min = $derived(props.min ?? 0);
  const max = $derived(props.max ?? 100);
  const step = $derived(props.step ?? 1);

  function set(raw: number) {
    props.value = clampSlider(props, Number.isFinite(raw) ? raw : props.value);
  }
</script>

<div class="slider-study">
  <div class="row">
    <span class="key">{props.key}</span>
    <input
      type="number"
      value={props.value}
      {min}
      {max}
      {step}
      oninput={(e) => set(+(e.target as HTMLInputElement).value)}
    />
  </div>
  <input
    type="range"
    value={props.value}
    {min}
    {max}
    {step}
    oninput={(e) => set(+(e.target as HTMLInputElement).value)}
  />
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
