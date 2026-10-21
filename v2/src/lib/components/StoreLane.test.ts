import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import StoreLane from './StoreLane.svelte';
import { startPointerDrag, _setElementFromPoint } from '../drag/engine';
import { makeNotebookDropCallbacks } from '../drag/notebook-drop';
import type { CardType, Store } from '../card-types';
import type { Notebook } from '../types';

const write: Store = { id: 'write', name: 'Write' };

function type(over: Partial<CardType> = {}): CardType {
  return { id: 'ct_1', name: 'Note', slots: [{ type: 'text', props: { text: 'x' } }], ...over };
}

function pev(t: string, x: number, y = 0): PointerEvent {
  return new MouseEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true }) as PointerEvent;
}

describe('StoreLane', () => {
  it('renders the store name, count, and one chip per type', () => {
    const onpick = vi.fn();
    const { container } = render(StoreLane, {
      props: { store: write, types: [type(), type({ id: 'ct_2', name: 'Quiz' })], onpick },
    });
    expect(container.querySelector('h4')?.textContent).toContain('Write');
    expect(container.querySelector('h4')?.textContent).toContain('2');
    expect(container.querySelectorAll('.prodchip')).toHaveLength(2);
  });

  it('labels a null store as the Workshop lane', () => {
    const { container } = render(StoreLane, {
      props: { store: null, types: [type({ store: null })], onpick: vi.fn() },
    });
    expect(container.querySelector('h4')?.textContent).toContain('Workshop');
  });

  it('shows a dash when the lane is empty', () => {
    const { container } = render(StoreLane, {
      props: { store: write, types: [], onpick: vi.fn() },
    });
    expect(container.querySelectorAll('.prodchip')).toHaveLength(0);
    expect(container.textContent).toContain('—');
  });

  it('clicking a chip fires onpick with the type id', async () => {
    const onpick = vi.fn();
    const { container } = render(StoreLane, {
      props: { store: write, types: [type({ id: 'ct_9' })], onpick },
    });
    await fireEvent.click(container.querySelector('.prodchip') as Element);
    expect(onpick).toHaveBeenCalledWith('ct_9');
  });

  it('the h4 folds and unfolds the chip list', async () => {
    const { container } = render(StoreLane, {
      props: { store: write, types: [type()], onpick: vi.fn() },
    });
    expect(container.querySelectorAll('.prodchip')).toHaveLength(1);
    await fireEvent.click(container.querySelector('h4') as Element);
    await tick();
    expect(container.querySelectorAll('.prodchip')).toHaveLength(0);
  });

  it('honours foldedInit', () => {
    const { container } = render(StoreLane, {
      props: { store: write, types: [type()], foldedInit: true, onpick: vi.fn() },
    });
    expect(container.querySelectorAll('.prodchip')).toHaveLength(0);
  });
});

describe('StoreLane — product drag (pointer engine)', () => {
  const prod = type({ id: 'ct_note', name: 'Note', varieties: [{ name: 'Blue', accent: '#22f' }] });

  function fixture() {
    const nb: Notebook = {
      id: 'nb', name: 'N', createdAt: '', updatedAt: '',
      sections: [{ id: 's1', notebookId: 'nb', name: 'S', position: 0, cards: [] }],
    };
    const grid = document.createElement('div');
    grid.className = 'room-grid';
    grid.dataset.section = 's1';
    document.body.appendChild(grid);
    const cb = makeNotebookDropCallbacks({
      notebook: () => nb,
      selectedCard: () => null,
      selectedSection: () => null,
      clearSelection: () => {},
      confirmDelete: () => Promise.resolve(true),
      cardType: (id) => (id === prod.id ? prod : undefined),
      variety: (ct) => ct.varieties?.[0] ?? null,
    });
    const onpick = vi.fn();
    const ongrip = (id: string, e: PointerEvent, el: HTMLElement) =>
      startPointerDrag({ kind: 'product', id, srcEl: el }, e, cb);
    const { container } = render(StoreLane, { props: { store: write, types: [prod], onpick, ongrip } });
    return { nb, grid, onpick, chip: container.querySelector('.prodchip') as HTMLElement };
  }

  afterEach(() => {
    document.dispatchEvent(pev('pointerup', 0, 0));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    _setElementFromPoint(null);
    document.body.innerHTML = '';
  });

  it('dragging a chip onto a room grid places the product; the chip never ghosts', () => {
    const { nb, grid, chip } = fixture();
    _setElementFromPoint(() => grid);
    fireEvent(chip, pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointermove', 60, 60));
    expect(chip.style.display).toBe(''); // v1 90:34 — the source chip stays put
    document.dispatchEvent(pev('pointerup', 60, 60));
    expect(nb.sections[0].cards).toHaveLength(1);
    expect(nb.sections[0].cards[0].typeId).toBe('ct_note');
    expect(nb.sections[0].cards[0].accent).toBe('#22f'); // session default variety
  });

  it('a completed drag suppresses the chip click, so onpick does not fire', async () => {
    const { grid, onpick, chip } = fixture();
    _setElementFromPoint(() => grid);
    fireEvent(chip, pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointermove', 60, 60));
    document.dispatchEvent(pev('pointerup', 60, 60));
    await fireEvent.click(chip);
    expect(onpick).not.toHaveBeenCalled();
  });

  it('a press without movement still fires the chip click (onpick)', async () => {
    const { onpick, chip } = fixture();
    fireEvent(chip, pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointerup', 0, 0));
    await fireEvent.click(chip);
    expect(onpick).toHaveBeenCalledWith('ct_note');
  });
});
