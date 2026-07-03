<script lang="ts">
  import type { ComputeProps } from './compute';

  let { props = $bindable(), onUpdate }: {
    props: ComputeProps;
    onUpdate: (props: ComputeProps) => void;
  } = $props();

  function field<K extends keyof ComputeProps>(k: K, v: ComputeProps[K]) {
    props[k] = v;
    onUpdate(props);
  }
</script>

<div class="compute-edit">
  <label>out <input value={props.out} oninput={(e) => field('out', (e.target as HTMLInputElement).value)} /></label>
  <label>= <input class="expr" value={props.expr} oninput={(e) => field('expr', (e.target as HTMLInputElement).value)} placeholder="e.g. n * n" /></label>
  <label>note <input value={props.note ?? ''} oninput={(e) => field('note', (e.target as HTMLInputElement).value)} /></label>
</div>

<style>
  .compute-edit {
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
    background: var(--surface, #16213e);
    color: var(--text, #e0e0e0);
    border: 1px solid var(--border, #2a2a4a);
    border-radius: 4px;
    padding: 2px 4px;
    width: 8ch;
  }
  input.expr {
    width: 16ch;
  }
</style>
