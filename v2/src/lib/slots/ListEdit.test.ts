import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import ListEdit from './ListEdit.svelte';
import { _setElementFromPoint } from '../drag/engine';
import { dustState } from '../drag/dust.svelte';
import type { ListProps } from './list';

const pev = (type: string, x: number, y: number) =>
  new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });

function stubRectV(el: Element, top: number, height = 40) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top, width: 200, height, right: 200, bottom: top + height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
}

function setup(props: Partial<ListProps> = {}, state?: Record<string, unknown>) {
  const onUpdate = vi.fn();
  const onState = vi.fn();
  const { container } = render(ListEdit, {
    props: {
      props: { items: ['x', 'y', 'z'], style: 'check' as const, ...props },
      onUpdate,
      ...(state !== undefined ? { state, onState } : {}),
    },
  });
  const rows = [...container.querySelectorAll('[data-qrow]')];
  const grips = rows.map((r) => r.querySelector('.ce-opt-grip') as HTMLElement);
  return { container, onUpdate, onState, rows, grips };
}

function dragToEnd(rows: Element[], grips: HTMLElement[], from: number) {
  const rest = rows.filter((_, i) => i !== from);
  rest.forEach((r, i) => stubRectV(r, i * 40));
  const last = rest[rest.length - 1];
  _setElementFromPoint(() => last);
  grips[from].dispatchEvent(pev('pointerdown', 0, 0));
  const y = (rest.length - 1) * 40 + 30;
  document.dispatchEvent(pev('pointermove', 0, y));
  document.dispatchEvent(pev('pointerup', 0, y));
}

beforeEach(() => {
  _setElementFromPoint(() => null);
});

afterEach(() => {
  document.dispatchEvent(pev('pointerup', 0, 0));
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  _setElementFromPoint(null);
  dustState.show = false;
  dustState.hot = false;
});

describe('ListEdit — drag reorder', () => {
  it('renders a .ce-opt-grip per [data-qrow] row inside the .ce-choice grid', () => {
    const { container, rows, grips } = setup();
    expect(container.querySelector('ul.ce-choice')).not.toBeNull();
    expect(rows).toHaveLength(3);
    grips.forEach((g) => expect(g?.textContent).toBe('⋮⋮'));
  });

  it('dragging an item to the end reorders the items', () => {
    const { onUpdate, rows, grips } = setup();
    dragToEnd(rows, grips, 0);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].items).toEqual(['y', 'z', 'x']);
  });

  it('checklist done-ticks follow their items through reader state', () => {
    const { onUpdate, onState, rows, grips } = setup({}, { checked: [true, false, true] });
    dragToEnd(rows, grips, 0); // [y,z,x]: x's tick 0→2, z's tick 2→1
    expect(onUpdate.mock.calls[0][0].items).toEqual(['y', 'z', 'x']);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState.mock.calls[0][0]).toEqual({ checked: [false, true, true] });
  });

  it('no reader ticks yet → items reorder without touching state', () => {
    const { onUpdate, onState, rows, grips } = setup({}, {});
    dragToEnd(rows, grips, 0);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onState).not.toHaveBeenCalled();
  });
});
