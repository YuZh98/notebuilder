<script lang="ts">
  import type { ProgressProps } from './progress';

  // allTags is threaded by CardView outside the typed EditComponent contract
  // (same type-erasure pattern ProgressStudy uses for `completion`): the distinct
  // tags across the notebook, so the track picker can offer real chips.
  let { props, onUpdate, allTags = [] } = $props<{
    props: ProgressProps;
    onUpdate: (props: ProgressProps) => void;
    allTags?: string[];
  }>();

  // v1 pgShow defaults: mn/bar true, pct false.
  function flagOn(flag: 'mn' | 'pct' | 'bar'): boolean {
    const sh = props.show;
    if (flag === 'pct') return !!(sh && sh.pct);
    return !sh || sh[flag] !== false;
  }

  function handleScope(e: Event) {
    const target = e.target as HTMLSelectElement;
    onUpdate({ ...props, scope: target.value as ProgressProps['scope'] });
  }

  function handleLabel(e: Event) {
    const target = e.target as HTMLInputElement;
    onUpdate({ ...props, label: target.value });
  }

  function toggleFlag(flag: 'mn' | 'pct' | 'bar') {
    onUpdate({ ...props, show: { ...(props.show ?? {}), [flag]: !flagOn(flag) } });
  }

  function toggleTrack(tag: string) {
    const track = props.track ?? [];
    const next = track.includes(tag) ? track.filter((t: string) => t !== tag) : [...track, tag];
    onUpdate({ ...props, track: next });
  }

  const track = $derived(props.track ?? []);
</script>

<div class="progress-edit">
  <label class="field">
    <span>Scope</span>
    <select value={props.scope} onchange={handleScope}>
      <option value="section">Section</option>
      <option value="chapter">Chapter</option>
      <option value="notebook">Notebook</option>
    </select>
  </label>

  <label class="field">
    <span>Label</span>
    <input type="text" value={props.label ?? ''} placeholder="Progress" oninput={handleLabel} />
  </label>

  <div class="toggles">
    <span class="toggle-label">Show</span>
    <label class="toggle">
      <input type="checkbox" checked={flagOn('mn')} onchange={() => toggleFlag('mn')} />
      M/N
    </label>
    <label class="toggle">
      <input type="checkbox" checked={flagOn('pct')} onchange={() => toggleFlag('pct')} />
      %
    </label>
    <label class="toggle">
      <input type="checkbox" checked={flagOn('bar')} onchange={() => toggleFlag('bar')} />
      Bar
    </label>
  </div>

  {#if allTags.length}
    <div class="toggles">
      <span class="toggle-label">Track</span>
      <div class="tagchips">
        {#each allTags as tag (tag)}
          <button
            type="button"
            class="tagchip"
            class:on={track.includes(tag)}
            onclick={() => toggleTrack(tag)}
          >{tag}</button>
        {/each}
      </div>
    </div>
  {/if}
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
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
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

  .tagchips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tagchip {
    padding: 2px 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    color: var(--ink);
    font-size: 12px;
    cursor: pointer;
  }

  .tagchip.on {
    background: var(--accent, #7c3aed);
    border-color: var(--accent, #7c3aed);
    color: #fff;
  }
</style>
