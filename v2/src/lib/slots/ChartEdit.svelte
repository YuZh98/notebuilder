<script lang="ts">
  import type { ChartProps } from './chart';

  let { props = $bindable(), onUpdate }: {
    props: ChartProps;
    onUpdate: (props: ChartProps) => void;
  } = $props();

  function field<K extends keyof ChartProps>(k: K, v: ChartProps[K]) {
    props[k] = v;
    onUpdate(props);
  }
</script>

<div class="chart-edit">
  <label>f(x) <input class="fn" value={props.fn} oninput={(e) => field('fn', (e.target as HTMLInputElement).value)} placeholder="e.g. a*x" /></label>
  <label>x0 <input type="number" value={props.x0 ?? 0} oninput={(e) => field('x0', +(e.target as HTMLInputElement).value)} /></label>
  <label>x1 <input type="number" value={props.x1 ?? 10} oninput={(e) => field('x1', +(e.target as HTMLInputElement).value)} /></label>
  <label>y0 <input type="number" value={props.y0 ?? ''} oninput={(e) => field('y0', +(e.target as HTMLInputElement).value)} /></label>
  <label>y1 <input type="number" value={props.y1 ?? ''} oninput={(e) => field('y1', +(e.target as HTMLInputElement).value)} /></label>
  <label>x ticks <input type="number" value={props.xticks ?? 0} oninput={(e) => field('xticks', +(e.target as HTMLInputElement).value)} /></label>
  <label>y ticks <input type="number" value={props.yticks ?? 0} oninput={(e) => field('yticks', +(e.target as HTMLInputElement).value)} /></label>
  <label class="chk"><input type="checkbox" checked={props.hover ?? false} onchange={(e) => field('hover', (e.target as HTMLInputElement).checked)} /> hover</label>
  <label>label <input value={props.label ?? ''} oninput={(e) => field('label', (e.target as HTMLInputElement).value)} /></label>
</div>

<style>
  .chart-edit {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    opacity: 0.85;
  }
  input {
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 2px 4px;
    width: 6ch;
  }
  input.fn {
    width: 12ch;
  }
  input[type='checkbox'] {
    width: auto;
  }
</style>
