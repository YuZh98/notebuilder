import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CoverageMatrix from './CoverageMatrix.svelte';
import { _setElementFromPoint } from '../drag/header-drag';
import { mode } from '../stores/mode';
import { cellKey, UNTAG, type MatrixAxis } from '../coverage-matrix';
import type { Notebook, Section, Card } from '../types';
import type { CardType } from '../card-types';

const types: CardType[] = [
  { id: 't1', name: 'Flashcard', slots: [] },
  { id: 't2', name: 'Quiz', slots: [] },
];

function card(over: Partial<Card> & { id: string; sectionId: string }): Card {
  return { position: 0, slots: [], ...over };
}

function section(id: string, name: string, cards: Card[], kind?: 'divider'): Section {
  return { id, notebookId: 'nb', name, position: 0, cards, ...(kind ? { kind } : {}) };
}

// s1: c1(Flashcard, math), c2(Quiz, math)  · s2: c3(Flashcard, science), c4(untyped, untagged)
function nb(): Notebook {
  return {
    id: 'nb',
    name: 'NB',
    createdAt: '',
    updatedAt: '',
    sections: [
      section('s1', 'Intro', [
        card({ id: 'c1', sectionId: 's1', typeId: 't1', tags: ['math'] }),
        card({ id: 'c2', sectionId: 's1', typeId: 't2', tags: ['math'] }),
      ]),
      section('s2', 'Body', [
        card({ id: 'c3', sectionId: 's2', typeId: 't1', tags: ['science'] }),
        card({ id: 'c4', sectionId: 's2' }),
      ]),
    ],
  };
}

function baseProps(over: Record<string, unknown> = {}) {
  return {
    notebook: nb(),
    cardTypes: types,
    mtxRow: null as MatrixAxis | null,
    mtxCol: null as MatrixAxis | null,
    cells: [] as string[],
    fold: false,
    onaxis: vi.fn(),
    oncells: vi.fn(),
    onfold: vi.fn(),
    ...over,
  };
}

afterEach(() => {
  document.dispatchEvent(new MouseEvent('pointerup', { clientX: 0, clientY: 0 }));
  _setElementFromPoint(null);
  mode.set('edit');
});

function stubRect(el: Element, r: { left?: number; top?: number; width?: number; height?: number }) {
  const left = r.left ?? 0;
  const top = r.top ?? 0;
  const width = r.width ?? 0;
  const height = r.height ?? 0;
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

function pev(type: string, x: number, y: number): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }) as PointerEvent;
}

describe('CoverageMatrix — structure', () => {
  it('renders nothing when fewer than two axes qualify', () => {
    const bare: Notebook = {
      id: 'nb',
      name: 'NB',
      createdAt: '',
      updatedAt: '',
      sections: [section('s1', 'Only', [card({ id: 'c1', sectionId: 's1' })])],
    };
    const { container } = render(CoverageMatrix, { props: baseProps({ notebook: bare }) });
    expect(container.querySelector('.mtx-wrap')).toBeNull();
  });

  it('renders a CSS-grid matrix (default section × product) with headers and cells', () => {
    const { container } = render(CoverageMatrix, { props: baseProps() });
    expect(container.querySelector('.mtx-wrap')).toBeInTheDocument();
    // section rows × product cols: 2 rows, 3 cols (Flashcard, Quiz, untyped)
    expect(container.querySelectorAll('.mtx-rowh')).toHaveLength(2);
    expect(container.querySelectorAll('.mtx-colh')).toHaveLength(3);
    expect(container.querySelectorAll('.mtx-cell')).toHaveLength(6);
    expect(container.querySelector('.mtx-corner')).toBeInTheDocument();
  });

  it('cells show live counts and mark zeros with .mtx-zero', () => {
    const { container } = render(CoverageMatrix, { props: baseProps() });
    // s1 row: Flashcard=1(c1), Quiz=1(c2), untyped=0
    const cells = [...container.querySelectorAll('.mtx-cell')].map((c) => c.textContent?.trim());
    expect(cells).toEqual(['1', '1', '0', '1', '0', '1']);
    const zeros = [...container.querySelectorAll('.mtx-cell.mtx-zero')].map((c) => c.textContent?.trim());
    expect(zeros).toEqual(['0', '0']);
  });

  it('the untyped/untagged ∅ header gets .mtx-untag', () => {
    const { container } = render(CoverageMatrix, { props: baseProps() });
    const untag = container.querySelector('.mtx-colh.mtx-untag');
    expect(untag).toBeInTheDocument();
    expect(untag?.textContent).toContain('untyped');
  });
});

describe('CoverageMatrix — axis pickers', () => {
  it('disables the chip that is the other axis and any axis with <2 values', () => {
    // remove untyped card so product has 2 values, keep section 2, tag 2 (math, science, ∅ = 3)
    const { container } = render(CoverageMatrix, { props: baseProps() });
    const [rowSet, colSet] = container.querySelectorAll('.axset');
    // row axset chips: Sections(on), Tags, Products(disabled — it's the col axis)
    const rowChips = [...rowSet.querySelectorAll('button')];
    const rowProducts = rowChips.find((b) => b.textContent === 'Products')!;
    expect(rowProducts).toBeDisabled();
    const rowSections = rowChips.find((b) => b.textContent === 'Sections')!;
    expect(rowSections).toHaveClass('on');
    // col axset: Sections disabled (it's the row axis)
    const colSections = [...colSet.querySelectorAll('button')].find((b) => b.textContent === 'Sections')!;
    expect(colSections).toBeDisabled();
  });

  it('clicking the row Tags chip requests row=tag (swap not needed)', async () => {
    const onaxis = vi.fn();
    const { container } = render(CoverageMatrix, { props: baseProps({ onaxis }) });
    const [rowSet] = container.querySelectorAll('.axset');
    const tags = [...rowSet.querySelectorAll('button')].find((b) => b.textContent === 'Tags')!;
    await fireEvent.click(tags);
    expect(onaxis).toHaveBeenCalledWith('tag', 'product');
  });

  it('picking the other axis on a side swaps them', async () => {
    const onaxis = vi.fn();
    // row=section, col=product; click col → Sections should swap col to section, row to product
    const { container } = render(CoverageMatrix, {
      props: baseProps({ onaxis, mtxRow: 'section', mtxCol: 'tag' }),
    });
    const [, colSet] = container.querySelectorAll('.axset');
    // pick Products for the col (no collision) — simple set
    const products = [...colSet.querySelectorAll('button')].find((b) => b.textContent === 'Products')!;
    await fireEvent.click(products);
    expect(onaxis).toHaveBeenCalledWith('section', 'product');
  });

  it('picking on the row the axis currently held by col swaps the two', async () => {
    const onaxis = vi.fn();
    const { container } = render(CoverageMatrix, {
      props: baseProps({ onaxis, mtxRow: 'section', mtxCol: 'tag' }),
    });
    const [rowSet] = container.querySelectorAll('.axset');
    const tags = [...rowSet.querySelectorAll('button')].find((b) => b.textContent === 'Tags')!;
    await fireEvent.click(tags);
    // row wants tag (held by col) → col takes the old row (section)
    expect(onaxis).toHaveBeenCalledWith('tag', 'section');
  });
});

describe('CoverageMatrix — selection gestures', () => {
  it('clicking a cell toggles just that cell', async () => {
    const oncells = vi.fn();
    const { container } = render(CoverageMatrix, { props: baseProps({ oncells }) });
    const cell = container.querySelector('.mtx-cell') as Element; // s1 × Flashcard
    await fireEvent.click(cell);
    expect(oncells).toHaveBeenCalledWith([cellKey('s1', 'Flashcard')]);
  });

  it('clicking a row header toggles the whole row', async () => {
    const oncells = vi.fn();
    const { container } = render(CoverageMatrix, { props: baseProps({ oncells }) });
    const rowh = container.querySelector('.mtx-rowh') as Element; // s1
    await fireEvent.click(rowh);
    expect(oncells).toHaveBeenCalledWith([
      cellKey('s1', 'Flashcard'),
      cellKey('s1', 'Quiz'),
      cellKey('s1', UNTAG),
    ]);
  });

  it('clicking a column header toggles the whole column', async () => {
    const oncells = vi.fn();
    const { container } = render(CoverageMatrix, { props: baseProps({ oncells }) });
    const colh = container.querySelector('.mtx-colh') as Element; // Flashcard
    await fireEvent.click(colh);
    expect(oncells).toHaveBeenCalledWith([cellKey('s1', 'Flashcard'), cellKey('s2', 'Flashcard')]);
  });

  it('corner selects the full cross-product when nothing is selected, and is .on', async () => {
    const oncells = vi.fn();
    const { container } = render(CoverageMatrix, { props: baseProps({ oncells }) });
    const corner = container.querySelector('.mtx-corner') as Element;
    expect(corner).toHaveClass('on'); // .on when no filter active
    await fireEvent.click(corner);
    expect(oncells).toHaveBeenCalledWith([
      cellKey('s1', 'Flashcard'),
      cellKey('s1', 'Quiz'),
      cellKey('s1', UNTAG),
      cellKey('s2', 'Flashcard'),
      cellKey('s2', 'Quiz'),
      cellKey('s2', UNTAG),
    ]);
  });

  it('corner clears everything when a filter is active, and is not .on', async () => {
    const oncells = vi.fn();
    const { container } = render(CoverageMatrix, {
      props: baseProps({ oncells, cells: [cellKey('s1', 'Flashcard')] }),
    });
    const corner = container.querySelector('.mtx-corner') as Element;
    expect(corner).not.toHaveClass('on');
    await fireEvent.click(corner);
    expect(oncells).toHaveBeenCalledWith([]);
  });

  it('marks selected cells and fully-selected headers .on', () => {
    const { container } = render(CoverageMatrix, {
      props: baseProps({ cells: [cellKey('s1', 'Flashcard'), cellKey('s2', 'Flashcard')] }),
    });
    // both Flashcard cells selected → the Flashcard column header is .on
    const colh = container.querySelector('.mtx-colh') as Element;
    expect(colh).toHaveClass('on');
    // s1 row not fully selected
    const rowh = container.querySelector('.mtx-rowh') as Element;
    expect(rowh).not.toHaveClass('on');
    expect(container.querySelectorAll('.mtx-cell.on')).toHaveLength(2);
  });

  it('shows a clear-filter button only when a filter is active', async () => {
    const oncells = vi.fn();
    const { container, rerender } = render(CoverageMatrix, { props: baseProps({ oncells }) });
    expect([...container.querySelectorAll('.mtx-head button')].some((b) => b.textContent === 'clear filter')).toBe(false);
    await rerender(baseProps({ oncells, cells: [cellKey('s1', 'Flashcard')] }));
    const clear = [...container.querySelectorAll('.mtx-head button')].find((b) => b.textContent === 'clear filter')!;
    expect(clear).toBeInTheDocument();
    await fireEvent.click(clear);
    expect(oncells).toHaveBeenCalledWith([]);
  });
});

describe('CoverageMatrix — fold', () => {
  it('folded shows only the head, no grid; the chip fires onfold', async () => {
    const onfold = vi.fn();
    const { container } = render(CoverageMatrix, { props: baseProps({ fold: true, onfold }) });
    expect(container.querySelector('.mtx-head')).toBeInTheDocument();
    expect(container.querySelector('.mtx')).toBeNull();
    expect(container.querySelector('.axset')).toBeNull();
    const chip = [...container.querySelectorAll('.mtx-head button')].find((b) => b.textContent?.includes('▸'))!;
    await fireEvent.click(chip);
    expect(onfold).toHaveBeenCalled();
  });
});

describe('CoverageMatrix — reorder grips', () => {
  it('renders inert section grips in Edit only, never on ∅ or non-reorderable axes', () => {
    const { container, unmount } = render(CoverageMatrix, { props: baseProps() });
    // rows = section (reorderable) → row grips present; cols = product (not) → no col grips
    expect(container.querySelectorAll('[data-mtxrowgrip]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-mtxcolgrip]')).toHaveLength(0);
    unmount();

    mode.set('study');
    const study = render(CoverageMatrix, { props: baseProps() });
    expect(study.container.querySelector('[data-mtxrowgrip]')).toBeNull();
  });

  it('dragging a section row grip past the next header midline reorders and shows the drop-line', async () => {
    const onreordersections = vi.fn();
    const { container } = render(CoverageMatrix, { props: baseProps({ onreordersections }) });
    const rowHeaders = [...container.querySelectorAll('.mtx-rowh')] as HTMLElement[]; // s1, s2
    stubRect(rowHeaders[1], { left: 0, top: 40, width: 80, height: 20 }); // mid y = 50
    _setElementFromPoint(() => rowHeaders[1]);
    const grip = rowHeaders[0].querySelector('[data-mtxrowgrip]') as HTMLElement;

    await fireEvent(grip, pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointermove', 10, 60)); // y past mid 50 → after
    expect(rowHeaders[1]).toHaveClass('dropafter');

    document.dispatchEvent(pev('pointerup', 10, 60));
    expect(onreordersections).toHaveBeenCalledWith(0, 1); // section 0 moved after section 1
    expect(container.querySelector('.dropafter')).toBeNull(); // line cleared on release
  });
});

describe('CoverageMatrix — live counts update', () => {
  it('recomputes counts when the notebook changes', async () => {
    const props = baseProps();
    const { container, rerender } = render(CoverageMatrix, { props });
    expect([...container.querySelectorAll('.mtx-cell')][0].textContent?.trim()).toBe('1');

    const grown = nb();
    grown.sections[0].cards.push(
      card({ id: 'c5', sectionId: 's1', typeId: 't1', tags: ['math'] }),
    );
    await rerender({ ...props, notebook: grown });
    // s1 × Flashcard now has c1 + c5 = 2
    expect([...container.querySelectorAll('.mtx-cell')][0].textContent?.trim()).toBe('2');
  });
});
