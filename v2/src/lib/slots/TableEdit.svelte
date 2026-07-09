<script lang="ts">
  let { props = $bindable(), onUpdate } = $props<{
    props: { rows: string[][] };
    onUpdate?: (props: { rows: string[][] }) => void;
  }>();

  function setCell(r: number, c: number, value: string) {
    const rows = props.rows.map((row: string[]) => row.slice());
    rows[r][c] = value;
    props.rows = rows;
    onUpdate?.(props);
  }

  function addRow() {
    const cols = props.rows[0]?.length ?? 1;
    props.rows = [...props.rows, Array.from({ length: cols }, () => '')];
    onUpdate?.(props);
  }

  function addColumn() {
    props.rows = props.rows.map((row: string[]) => [...row, '']);
    onUpdate?.(props);
  }
</script>

<div class="table-edit">
  <table>
    <tbody>
      {#each props.rows as row, r}
        <tr>
          {#each row as cell, c}
            <td>
              <input
                value={cell}
                oninput={(e) => setCell(r, c, (e.target as HTMLInputElement).value)}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="table-edit-actions">
    <button type="button" onclick={addRow}>Add row</button>
    <button type="button" onclick={addColumn}>Add column</button>
  </div>
</div>

<style>
  .table-edit table {
    border-collapse: collapse;
  }
  .table-edit td {
    border: 1px solid var(--line);
    padding: 0;
  }
  .table-edit input {
    border: none;
    padding: 6px 8px;
    background: var(--panel);
    color: var(--ink);
    font-family: inherit;
    font-size: 14px;
  }
  .table-edit-actions {
    margin-top: 8px;
    display: flex;
    gap: 8px;
  }
  .table-edit-actions button {
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    font-size: 13px;
  }
</style>
