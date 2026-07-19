<script lang="ts">
  import type { SliderProps } from './slider';

  let { props = $bindable(), onUpdate }: {
    props: SliderProps;
    onUpdate: (props: SliderProps) => void;
  } = $props();

  function field<K extends keyof SliderProps>(k: K, v: SliderProps[K]) {
    props[k] = v;
    onUpdate(props);
  }
</script>

<div class="slider-edit">
  <label>key <input value={props.key} oninput={(e) => field('key', (e.target as HTMLInputElement).value)} /></label>
  <label>value <input type="number" value={props.value} oninput={(e) => field('value', +(e.target as HTMLInputElement).value)} /></label>
  <label>min <input type="number" value={props.min ?? ''} oninput={(e) => field('min', +(e.target as HTMLInputElement).value)} /></label>
  <label>max <input type="number" value={props.max ?? ''} oninput={(e) => field('max', +(e.target as HTMLInputElement).value)} /></label>
  <label>step <input type="number" value={props.step ?? ''} oninput={(e) => field('step', +(e.target as HTMLInputElement).value)} /></label>
  <label class="flag"><input type="checkbox" checked={props.showName !== false} onchange={(e) => field('showName', (e.target as HTMLInputElement).checked)} /> name</label>
  <label class="flag"><input type="checkbox" checked={props.showValue !== false} onchange={(e) => field('showValue', (e.target as HTMLInputElement).checked)} /> value</label>
  <label class="flag"><input type="checkbox" checked={props.showSlider !== false} onchange={(e) => field('showSlider', (e.target as HTMLInputElement).checked)} /> slider</label>
</div>

<style>
  .slider-edit {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    opacity: 0.85;
  }
  input {
    width: 7ch;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 2px 4px;
  }
  label.flag input {
    width: auto;
  }
</style>
