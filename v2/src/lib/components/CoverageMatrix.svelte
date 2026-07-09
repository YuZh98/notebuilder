<script lang="ts">
  import { coverageMatrix, type MatrixAxis, type MatrixSelection } from '../coverage-matrix';
  import type { Card } from '../types';

  let {
    cards,
    states,
    selection,
    onselect,
  }: {
    cards: Card[];
    states: Record<string, Record<string, Record<string, unknown>>>;
    selection: MatrixSelection | null;
    onselect: (sel: MatrixSelection | null) => void;
  } = $props();

  const AXES: MatrixAxis[] = ['tag', 'slotType', 'done'];

  let rowAxis: MatrixAxis = $state('tag');
  let colAxis: MatrixAxis = $state('done');

  const matrix = $derived(coverageMatrix(cards, rowAxis, colAxis, states));

  function isSelected(row: string, col: string): boolean {
    return (
      selection !== null &&
      selection.rowAxis === rowAxis &&
      selection.rowVal === row &&
      selection.colAxis === colAxis &&
      selection.colVal === col
    );
  }

  function toggle(row: string, col: string) {
    onselect(isSelected(row, col) ? null : { rowAxis, rowVal: row, colAxis, colVal: col });
  }
</script>

<div class="matrix">
  <div class="axes">
    <label>
      rows
      <select bind:value={rowAxis} onchange={() => onselect(null)}>
        {#each AXES as a (a)}<option value={a}>{a}</option>{/each}
      </select>
    </label>
    <label>
      columns
      <select bind:value={colAxis} onchange={() => onselect(null)}>
        {#each AXES as a (a)}<option value={a}>{a}</option>{/each}
      </select>
    </label>
    {#if selection}
      <button class="clear" onclick={() => onselect(null)}>clear filter</button>
    {/if}
  </div>
  {#if matrix.rows.length === 0 || matrix.cols.length === 0}
    <p class="empty">No cards have values on these axes yet.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th></th>
          {#each matrix.cols as col (col)}<th>{col}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each matrix.rows as row (row)}
          <tr>
            <th>{row}</th>
            {#each matrix.cols as col (col)}
              {@const ids = matrix.cell(row, col)}
              <td>
                {#if ids.length > 0}
                  <button class:selected={isSelected(row, col)} onclick={() => toggle(row, col)}>
                    {ids.length}
                  </button>
                {:else}
                  <span class="zero">·</span>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .matrix {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    font-size: 12px;
  }
  .axes {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .axes label {
    display: flex;
    align-items: center;
    gap: 6px;
    opacity: 0.8;
  }
  select {
    background: var(--bg);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 2px 6px;
  }
  .clear {
    margin-left: auto;
    background: none;
    border: 1px solid var(--accent, #7c3aed);
    border-radius: 4px;
    color: var(--accent, #7c3aed);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 8px;
  }
  table {
    border-collapse: collapse;
  }
  th,
  td {
    padding: 4px 10px;
    text-align: center;
  }
  thead th,
  tbody th {
    opacity: 0.6;
    font-weight: 500;
    text-align: left;
  }
  td button {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    min-width: 32px;
    padding: 2px 6px;
  }
  td button:hover {
    border-color: var(--accent, #7c3aed);
  }
  td button.selected {
    background: var(--accent, #7c3aed);
    border-color: var(--accent, #7c3aed);
    color: var(--bg);
  }
  .zero {
    opacity: 0.3;
  }
  .empty {
    opacity: 0.6;
    margin: 4px 0;
  }
</style>
