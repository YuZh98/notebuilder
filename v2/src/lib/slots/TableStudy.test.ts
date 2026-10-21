import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TableStudy from './TableStudy.svelte';
import type { TableProps } from './table';

function setup(rows: string[][]) {
  const props: TableProps = { rows };
  const { container } = render(TableStudy, { props: { props } });
  const heads = () => [...container.querySelectorAll('th')].map((c) => c.textContent);
  const body = () =>
    [...container.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
  return { container, heads, body };
}

describe('TableStudy', () => {
  it('renders the first row as the header and the rest as body rows', () => {
    const { heads, body } = setup([['h1', 'h2'], ['a', 'b'], ['c', 'd']]);
    expect(heads()).toEqual(['h1', 'h2']);
    expect(body()).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('renders a header-only table with no body rows', () => {
    const { heads, body } = setup([['h1', 'h2']]);
    expect(heads()).toEqual(['h1', 'h2']);
    expect(body()).toEqual([]);
  });

  it('renders an empty table with neither header nor body cells', () => {
    const { container, heads, body } = setup([]);
    expect(container.querySelector('table')).not.toBeNull();
    expect(heads()).toEqual([]);
    expect(body()).toEqual([]);
  });

  // Cells are plain text — the table slot deliberately does not run markdown.
  it('renders cell markup as literal text', () => {
    const { container, heads } = setup([['**h**'], ['<b>x</b>']]);
    expect(heads()).toEqual(['**h**']);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('td')?.textContent).toBe('<b>x</b>');
  });
});
