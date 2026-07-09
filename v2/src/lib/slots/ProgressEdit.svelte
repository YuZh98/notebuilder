<script lang="ts">
  import type { ProgressProps } from './progress';

  let { props, onUpdate } = $props<{
    props: ProgressProps;
    onUpdate: (props: ProgressProps) => void;
  }>();

  function handleScope(e: Event) {
    const target = e.target as HTMLSelectElement;
    onUpdate({ ...props, scope: target.value as ProgressProps['scope'] });
  }

  function handleLabel(e: Event) {
    const target = e.target as HTMLInputElement;
    onUpdate({ ...props, label: target.value || 'Progress' });
  }

  function toggleFlag(flag: keyof NonNullable<ProgressProps['show']>) {
    const show = props.show ?? {};
    onUpdate({ ...props, show: { ...show, [flag]: !(show[flag] ?? true) } });
  }

  const show = $derived(props.show ?? {});
</script>

<div class="progress-edit">
  <label class="field">
    <span>Scope</span>
    <select value={props.scope} onchange={handleScope}>
      <option value="section">Section</option>
      <option value="notebook">Notebook</option>
    </select>
  </label>

  <label class="field">
    <span>Label</span>
    <input
      type="text"
      value={props.label ?? 'Progress'}
      placeholder="Progress"
      oninput={handleLabel}
    />
  </label>

  <div class="toggles">
    <span class="toggle-label">Show</span>
    <label class="toggle">
      <input type="checkbox" checked={show.mn ?? true} onchange={() => toggleFlag('mn')} />
      M/N
    </label>
    <label class="toggle">
      <input type="checkbox" checked={show.pct ?? true} onchange={() => toggleFlag('pct')} />
      %
    </label>
    <label class="toggle">
      <input type="checkbox" checked={show.bar ?? true} onchange={() => toggleFlag('bar')} />
      Bar
    </label>
  </div>
</div>

<style>
  .progress-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .field span {
    width: 60px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .field input,
  .field select {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--line, #2a2a4a);
    border-radius: 4px;
    background: var(--panel, #16213e);
    color: var(--ink, #e0e0e0);
    font-size: 13px;
    font-family: inherit;
  }

  .toggles {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }

  .toggle-label {
    opacity: 0.7;
    width: 60px;
    flex-shrink: 0;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
</style>
