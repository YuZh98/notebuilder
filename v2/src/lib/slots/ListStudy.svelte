<script lang="ts">
  import type { ListProps } from './list';
  import type { Scope } from '../variable-graph';

  let { props, state = {}, onState } = $props<{
    props: ListProps;
    scope?: Scope;
    state?: Record<string, unknown>;
    onState?: (next: Record<string, unknown>) => void;
  }>();

  function checkedAt(i: number): boolean {
    const arr = state.checked;
    if (!Array.isArray(arr)) return false;
    return arr[i] === true;
  }

  function toggle(i: number) {
    const arr: boolean[] = Array.isArray(state.checked)
      ? (state.checked as boolean[]).slice()
      : props.items.map(() => false);
    arr[i] = !arr[i];
    onState?.({ ...state, checked: arr });
  }
</script>

<div class="list-study">
  {#if props.style === 'bullets'}
    <ul>
      {#each props.items as item}
        <li>{item}</li>
      {/each}
    </ul>
  {:else if props.style === 'numbered'}
    <ol>
      {#each props.items as item}
        <li>{item}</li>
      {/each}
    </ol>
  {:else}
    <ul class="checklist">
      {#each props.items as item, i}
        <li>
          <label>
            <input
              type="checkbox"
              checked={checkedAt(i)}
              onchange={() => toggle(i)}
            />
            <span class:done={checkedAt(i)}>{item}</span>
          </label>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .list-study ul,
  .list-study ol {
    margin: 0;
    padding-left: 1.5em;
    font-size: 14px;
    line-height: 1.8;
    color: var(--text, #e0e0e0);
  }
  .checklist {
    list-style: none;
    padding-left: 0;
  }
  .checklist li {
    margin-bottom: 4px;
  }
  .checklist label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text, #e0e0e0);
  }
  .checklist input[type='checkbox'] {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .checklist span.done {
    text-decoration: line-through;
    opacity: 0.5;
  }
</style>
