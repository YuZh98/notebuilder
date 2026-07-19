import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ChartEdit from './ChartEdit.svelte';
import type { ChartProps } from './chart';

function setup(props: Partial<ChartProps> = {}) {
  const onUpdate = vi.fn();
  const { container } = render(ChartEdit, {
    props: {
      props: { fn: 'x', x0: 0, x1: 10, y0: 0, y1: 10, xticks: 5, yticks: 5, hover: false, label: '', ...props },
      onUpdate,
    },
  });
  return { container, onUpdate };
}

/** The <input> inside the first <label> whose trimmed text starts with `text`. */
function inputFor(container: HTMLElement, text: string): HTMLInputElement {
  const label = [...container.querySelectorAll('label')].find((l) =>
    (l.textContent ?? '').trim().startsWith(text),
  );
  if (!label) throw new Error(`no label starting with "${text}"`);
  return label.querySelector('input') as HTMLInputElement;
}

function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ChartEdit — field wiring', () => {
  const numericFields: Array<{ label: string; prop: keyof ChartProps; input: string; expected: number }> = [
    { label: 'y0', prop: 'y0', input: '3', expected: 3 },
    { label: 'y1', prop: 'y1', input: '7', expected: 7 },
    { label: 'x ticks', prop: 'xticks', input: '4', expected: 4 },
    { label: 'y ticks', prop: 'yticks', input: '6', expected: 6 },
  ];

  for (const { label, prop, input, expected } of numericFields) {
    it(`renders the ${label} field and edits fire onUpdate with the new ${prop}`, () => {
      const { container, onUpdate } = setup();
      const el = inputFor(container, label);
      expect(el).not.toBeNull();
      type(el, input);
      expect(onUpdate).toHaveBeenCalled();
      const last = onUpdate.mock.calls.at(-1)![0] as ChartProps;
      expect(last[prop]).toBe(expected);
    });
  }

  it('renders the hover checkbox and toggling it fires onUpdate with the new hover value', () => {
    const { container, onUpdate } = setup({ hover: false });
    const el = inputFor(container, 'hover');
    expect(el.type).toBe('checkbox');
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onUpdate).toHaveBeenCalled();
    const last = onUpdate.mock.calls.at(-1)![0] as ChartProps;
    expect(last.hover).toBe(true);
  });
});
