import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import ChoiceEdit from './ChoiceEdit.svelte';
import { _setElementFromPoint } from '../drag/engine';
import { dustState } from '../drag/dust.svelte';
import type { ChoiceProps } from './choice';
import { pev, stubRect } from '../test-utils';

function setup(props: Partial<ChoiceProps> = {}) {
  const onUpdate = vi.fn();
  const { container } = render(ChoiceEdit, {
    props: {
      props: { options: ['A', 'B', 'C'], answer: [], multi: false, ...props },
      onUpdate,
    },
  });
  const rows = [...container.querySelectorAll('[data-qrow]')];
  const grips = rows.map((r) => r.querySelector('.ce-opt-grip') as HTMLElement);
  return { container, onUpdate, rows, grips };
}

/** Drag row `from` and drop past the vertical midpoint of the last remaining row. */
function dragToEnd(rows: Element[], grips: HTMLElement[], from: number) {
  const rest = rows.filter((_, i) => i !== from);
  rest.forEach((r, i) => stubRect(r, { top: i * 40, width: 200, height: 40 }));
  const last = rest[rest.length - 1];
  _setElementFromPoint(() => last);
  grips[from].dispatchEvent(pev('pointerdown', 0, 0));
  const y = (rest.length - 1) * 40 + 30; // past the last row's midpoint → after it
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

describe('ChoiceEdit — option rows and grips', () => {
  it('renders a .ce-opt-grip per [data-qrow] row inside the .ce-choice grid', () => {
    const { container, rows, grips } = setup();
    expect(container.querySelector('ul.ce-choice')).not.toBeNull();
    expect(rows).toHaveLength(3);
    grips.forEach((g) => {
      expect(g).not.toBeNull();
      expect(g.textContent).toBe('⋮⋮');
    });
  });
});

describe('ChoiceEdit — drag reorder', () => {
  it('dragging a row to the end reorders the options', () => {
    const { onUpdate, rows, grips } = setup();
    dragToEnd(rows, grips, 0);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].options).toEqual(['B', 'C', 'A']);
  });

  it('the marked-correct answer follows its option', () => {
    const { onUpdate, rows, grips } = setup({ answer: [0] });
    dragToEnd(rows, grips, 0);
    expect(onUpdate.mock.calls[0][0]).toEqual({ options: ['B', 'C', 'A'], answer: [2], multi: false });
  });

  it('multi answers all remap and stay sorted', () => {
    const { onUpdate, rows, grips } = setup({ options: ['A', 'B', 'C', 'D'], answer: [1, 3], multi: true });
    dragToEnd(rows, grips, 0); // [B,C,D,A]: B 1→0, D 3→2
    expect(onUpdate.mock.calls[0][0].options).toEqual(['B', 'C', 'D', 'A']);
    expect(onUpdate.mock.calls[0][0].answer).toEqual([0, 2]);
  });

  it('never shows the dustbin during a qopt drag (D7)', () => {
    const { rows, grips } = setup();
    const b = rows[1];
    stubRect(b, { top: 0, width: 200, height: 40 });
    _setElementFromPoint(() => b);
    grips[0].dispatchEvent(pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointermove', 0, 30));
    expect(dustState.show).toBe(false);
    document.dispatchEvent(pev('pointerup', 0, 30));
    expect(dustState.show).toBe(false);
  });

  it('dropping on a foreign .ce-choice grid does nothing', () => {
    const { onUpdate, grips } = setup();
    const foreign = document.createElement('ul');
    foreign.className = 'ce-choice';
    document.body.appendChild(foreign);
    _setElementFromPoint(() => foreign);
    grips[0].dispatchEvent(pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointermove', 0, 30));
    expect(foreign.classList.contains('drop-on')).toBe(false);
    document.dispatchEvent(pev('pointerup', 0, 30));
    expect(onUpdate).not.toHaveBeenCalled();
    foreign.remove();
  });
});
