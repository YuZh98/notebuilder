<script lang="ts">
  import { mode } from '../stores/mode';
  import {
    matrixDims,
    effectiveAxes,
    mtxCount,
    toggleCells,
    cellKey,
    UNTAG,
    type MatrixAxis,
  } from '../coverage-matrix';
  import type { Notebook } from '../types';
  import type { CardType } from '../card-types';

  let {
    notebook,
    cardTypes,
    mtxRow,
    mtxCol,
    cells,
    fold,
    onaxis,
    oncells,
    onfold,
  }: {
    notebook: Notebook;
    cardTypes: CardType[];
    mtxRow: MatrixAxis | null;
    mtxCol: MatrixAxis | null;
    cells: string[];
    fold: boolean;
    /** Axis picked/swapped — App sets the raw axes and clears the selection. */
    onaxis: (row: MatrixAxis | null, col: MatrixAxis | null) => void;
    oncells: (cells: string[]) => void;
    onfold: () => void;
  } = $props();

  // Chip row order mirrors v1 axOpt (60-stage:84): Sections · Tags · Products.
  const CHIP_ORDER: MatrixAxis[] = ['section', 'tag', 'product'];

  const ed = $derived($mode === 'edit');
  const dims = $derived(matrixDims(notebook, cardTypes));
  const qualifies = $derived(dims.filter((d) => d.values.length >= 2).length >= 2);
  const axes = $derived(effectiveAxes(dims, mtxRow, mtxCol));
  const R = $derived(axes[0]);
  const C = $derived(axes[1]);
  const rows = $derived(R.values);
  const cols = $derived(C.values);
  const filterActive = $derived(cells.length > 0);

  const labelOf = (k: MatrixAxis) => dims.find((d) => d.key === k)!.label;
  const okAxis = (k: MatrixAxis) => dims.find((d) => d.key === k)!.values.length >= 2;
  const cellOn = (rv: string, cv: string) => cells.includes(cellKey(rv, cv));

  // v1 mtxaxis (70-events:85): swap when the pick collides with the other side; operate on raw axes.
  function changeAxis(ax: 'row' | 'col', d: MatrixAxis) {
    const rk = mtxRow ?? 'section';
    const ck = mtxCol ?? 'product';
    let nr: MatrixAxis = rk;
    let nc: MatrixAxis = ck;
    if (ax === 'row') {
      if (ck === d) nc = rk;
      nr = d;
    } else {
      if (rk === d) nr = ck;
      nc = d;
    }
    onaxis(nr, nc);
  }

  const toggleCell = (rv: string, cv: string) => oncells(toggleCells(cells, [cellKey(rv, cv)]));
  const toggleRow = (rv: string) => oncells(toggleCells(cells, cols.map((c) => cellKey(rv, c.id))));
  const toggleCol = (cv: string) => oncells(toggleCells(cells, rows.map((r) => cellKey(r.id, cv))));

  function toggleAll() {
    if (filterActive) {
      oncells([]);
      return;
    }
    const all: string[] = [];
    for (const r of rows) for (const c of cols) all.push(cellKey(r.id, c.id));
    oncells(all);
  }
</script>

{#if qualifies}
  <div class="mtx-wrap">
    <div class="mtx-head">
      <b>▦ Coverage</b>
      {#if !fold}
        <span class="muted sm">
          ROW
          <span class="axset">
            {#each CHIP_ORDER as dk (dk)}
              <button
                class="chip xs"
                class:on={R.key === dk}
                disabled={dk === C.key || !okAxis(dk)}
                title={dk === C.key ? 'already the other axis' : !okAxis(dk) ? 'needs ≥2 entries' : ''}
                onclick={() => changeAxis('row', dk)}>{labelOf(dk)}</button>
            {/each}
          </span>
          × COL
          <span class="axset">
            {#each CHIP_ORDER as dk (dk)}
              <button
                class="chip xs"
                class:on={C.key === dk}
                disabled={dk === R.key || !okAxis(dk)}
                title={dk === R.key ? 'already the other axis' : !okAxis(dk) ? 'needs ≥2 entries' : ''}
                onclick={() => changeAxis('col', dk)}>{labelOf(dk)}</button>
            {/each}
          </span>
        </span>
      {/if}
      <span class="spacer"></span>
      {#if filterActive}
        <button class="btn sm" onclick={() => oncells([])}>clear filter</button>
      {/if}
      <button class="btn sm ghost" title={fold ? 'expand' : 'collapse'} onclick={onfold}
        >{fold ? '▸' : '▾'}</button>
    </div>

    {#if !fold}
      <div
        class="mtx"
        style="grid-template-columns:minmax(80px,auto) repeat({cols.length},minmax(42px,1fr))"
      >
        <button
          class="mtx-c mtx-corner"
          class:on={!filterActive}
          title="select everything / clear"
          onclick={toggleAll}>▦</button>

        {#each cols as cv (cv.id)}
          {@const on = rows.every((rv) => cellOn(rv.id, cv.id))}
          <button
            class="mtx-c mtx-colh"
            class:on
            class:mtx-untag={cv.id === UNTAG}
            title={`click: toggle the “${cv.label}” column`}
            onclick={() => toggleCol(cv.id)}
          >
            {#if ed && C.reorderable && cv.id !== UNTAG}
              <span
                class="mtxgrip"
                data-mtxcolgrip={cv.id}
                data-dim={C.key}
                title="drag to reorder">⠿</span>
            {/if}{cv.label}</button>
        {/each}

        {#each rows as rv (rv.id)}
          {@const rowOn = cols.every((cv) => cellOn(rv.id, cv.id))}
          <button
            class="mtx-c mtx-rowh"
            class:on={rowOn}
            class:mtx-untag={rv.id === UNTAG}
            title={`click: toggle the “${rv.label}” row`}
            onclick={() => toggleRow(rv.id)}
          >
            {#if ed && R.reorderable && rv.id !== UNTAG}
              <span
                class="mtxgrip"
                data-mtxrowgrip={rv.id}
                data-dim={R.key}
                title="drag to reorder">⠿</span>
            {/if}{rv.label}</button>
          {#each cols as cv (cv.id)}
            {@const n = mtxCount(notebook, cardTypes, R, C, rv.id, cv.id)}
            <button
              class="mtx-c mtx-cell"
              class:on={cellOn(rv.id, cv.id)}
              class:mtx-zero={n === 0}
              title={`${rv.label} · ${cv.label} — ${n} card${n === 1 ? '' : 's'}`}
              onclick={() => toggleCell(rv.id, cv.id)}>{n}</button>
          {/each}
        {/each}
      </div>
    {/if}
  </div>
{/if}
