import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ComputeEdit from './ComputeEdit.svelte';
import type { ComputeProps } from './compute';

function setup(over: Partial<ComputeProps> = {}) {
  const props: ComputeProps = { expr: 'n * n', out: 'sq', note: 'square', ...over };
  const onUpdate = vi.fn();
  const { container } = render(ComputeEdit, { props: { props, onUpdate } });
  const inputs = () => Array.from(container.querySelectorAll<HTMLInputElement>('.compute-edit input'));
  return { container, props, onUpdate, inputs };
}

describe('ComputeEdit', () => {
  it('renders out, expr and note inputs seeded from props', () => {
    const { container, inputs } = setup();
    const [out, expr, note] = inputs();
    expect(out.value).toBe('sq');
    expect(expr.value).toBe('n * n');
    expect(expr.classList.contains('expr')).toBe(true);
    expect(note.value).toBe('square');
    expect(container.querySelector('input.expr')?.getAttribute('placeholder')).toBe('e.g. n * n');
  });

  it('editing the expression emits the full payload without mutating props', async () => {
    const { props, onUpdate, inputs } = setup();
    const expr = inputs()[1];
    expr.value = 'n + 1';
    await fireEvent.input(expr);
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ expr: 'n + 1', out: 'sq', note: 'square' });
    expect(props).toStrictEqual({ expr: 'n * n', out: 'sq', note: 'square' });
  });

  it('editing the out key emits the full payload', async () => {
    const { onUpdate, inputs } = setup();
    const out = inputs()[0];
    out.value = 'area';
    await fireEvent.input(out);
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ expr: 'n * n', out: 'area', note: 'square' });
  });

  it('a missing note renders empty and can be set', async () => {
    const { onUpdate, inputs } = setup({ note: undefined });
    const note = inputs()[2];
    expect(note.value).toBe('');
    note.value = 'hi';
    await fireEvent.input(note);
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ expr: 'n * n', out: 'sq', note: 'hi' });
  });
});
