<script lang="ts">
  let { props } = $props<{
    props: { rows: string[][] };
    scope?: Record<string, unknown>;
  }>();

  const header = $derived(props.rows[0] ?? []);
  const body = $derived(props.rows.slice(1));
</script>

<div class="table-study">
  <table>
    <thead>
      <tr>
        {#each header as cell}
          <th>{cell}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each body as row}
        <tr>
          {#each row as cell}
            <td>{cell}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-study table {
    border-collapse: collapse;
    width: 100%;
    font-size: 14px;
  }
  .table-study th,
  .table-study td {
    border: 1px solid var(--line);
    padding: 6px 10px;
    text-align: left;
  }
  .table-study th {
    background: var(--panel);
    font-weight: 600;
  }
</style>
