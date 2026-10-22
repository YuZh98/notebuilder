import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ComputeStudy from './ComputeStudy.svelte';
import type { ComputeProps } from './compute';
import type { Scope } from '../variable-graph';

function setup(over: Partial<ComputeProps> = {}, scope: Scope = {}) {
  const props: ComputeProps = { expr: 'n * n', out: 'sq', ...over };
  const { container } = render(ComputeStudy, { props: { props, scope } });
  const val = () => container.querySelector('.compute-study .val')?.textContent;
  return { container, val };
}

describe('ComputeStudy', () => {
  it('evaluates the expression against the scope', () => {
    const { val } = setup({}, { n: 3 });
    expect(val()).toBe('9');
  });

  it('rounds to four decimal places', () => {
    const { val } = setup({ expr: 'n / 3' }, { n: 1 });
    expect(val()).toBe('0.3333');
  });

  it('renders booleans as words', () => {
    const { val } = setup({ expr: 'n > 2' }, { n: 3 });
    expect(val()).toBe('true');
  });

  it('renders a dash for a non-finite result', () => {
    const { val } = setup({ expr: 'n / 0' }, { n: 1 });
    expect(val()).toBe('—');
  });

  it('shows the note only when present', () => {
    const with_ = setup({ note: 'square of n' }, { n: 2 });
    expect(with_.container.querySelector('.note')?.textContent).toBe('square of n');
    const without = setup({}, { n: 2 });
    expect(without.container.querySelector('.note')).toBeNull();
  });
});
