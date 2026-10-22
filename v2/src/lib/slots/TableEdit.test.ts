import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TableEdit from './TableEdit.svelte';
import type { TableProps } from './table';

function setup(rows: string[][] = [['a', 'b'], ['c', 'd']]) {
  const props: TableProps = { rows };
  const onUpdate = vi.fn();
  const { container } = render(TableEdit, { props: { props, onUpdate } });
  const cells = () => [...container.querySelectorAll('td input')] as HTMLInputElement[];
  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
  return { container, props, onUpdate, cells, button };
}

const payload = (onUpdate: ReturnType<typeof vi.fn>) => onUpdate.mock.calls.at(-1)![0] as TableProps;

describe('TableEdit — cell grid', () => {
  it('renders one input per cell, in row order', () => {
    const { cells } = setup();
    expect(cells().map((i) => i.value)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('typing in a cell fires onUpdate with only that cell replaced', async () => {
    const { cells, onUpdate, props } = setup();
    const cell = cells()[2];
    cell.value = 'C!';
    await fireEvent.input(cell);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(payload(onUpdate)).toStrictEqual({ rows: [['a', 'b'], ['C!', 'd']] });
    expect(props.rows).toStrictEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('TableEdit — structure buttons', () => {
  it('Add row appends a blank row as wide as the first row', async () => {
    const { button, onUpdate } = setup();
    await fireEvent.click(button('Add row'));
    expect(payload(onUpdate)).toStrictEqual({ rows: [['a', 'b'], ['c', 'd'], ['', '']] });
  });

  it('Add column appends a blank cell to every row', async () => {
    const { button, onUpdate } = setup();
    await fireEvent.click(button('Add column'));
    expect(payload(onUpdate)).toStrictEqual({ rows: [['a', 'b', ''], ['c', 'd', '']] });
  });

  it('Add row on an empty table falls back to a single column', async () => {
    const { cells, button, onUpdate } = setup([]);
    expect(cells()).toHaveLength(0);
    await fireEvent.click(button('Add row'));
    expect(payload(onUpdate)).toStrictEqual({ rows: [['']] });
  });
});
