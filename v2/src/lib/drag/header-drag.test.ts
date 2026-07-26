import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHeaderDrag, dropIndex, _setElementFromPoint } from './header-drag';
import * as history from './gesture-history';
import { applyZoom } from '../zoom';

// jsdom has no PointerEvent; listeners key off the type string, so a MouseEvent stand-in works.
function pev(type: string, x: number, y = 0, init: MouseEventInit = {}): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, ...init }) as PointerEvent;
}

function stubRect(el: Element, r: { left?: number; top?: number; width?: number; height?: number }) {
  const left = r.left ?? 0;
  const top = r.top ?? 0;
  const width = r.width ?? 0;
  const height = r.height ?? 0;
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

// A matrix with `n` column headers laid out horizontally, each 100px wide, and a grip in header 0.
function colSetup(n = 3) {
  const mtx = document.createElement('div');
  mtx.className = 'mtx';
  const headers: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const h = document.createElement('button');
    h.className = 'mtx-c mtx-colh';
    const grip = document.createElement('span');
    grip.className = 'mtxgrip';
    h.appendChild(grip);
    mtx.appendChild(h);
    stubRect(h, { left: i * 100, top: 0, width: 100, height: 40 });
    headers.push(h);
  }
  document.body.appendChild(mtx);
  return { mtx, headers, grip: headers[0].querySelector('span') as HTMLElement };
}

function startCol(mtx: Element, onreorder = vi.fn()) {
  startHeaderDrag(pev('pointerdown', 0, 0), {
    axis: 'col',
    fromIndex: 0,
    headerSel: '.mtx-colh',
    container: mtx,
    onreorder,
  });
  return onreorder;
}

const fly = () => document.querySelector<HTMLElement>('.drag-fly');

beforeEach(() => {
  _setElementFromPoint(() => null);
});

afterEach(() => {
  document.dispatchEvent(pev('pointercancel', 0, 0));
  document.dispatchEvent(pev('pointerup', 0, 0));
  _setElementFromPoint(null);
  document.body.innerHTML = '';
  document.documentElement.style.userSelect = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('dropIndex — splice destination', () => {
  it('drops after a target below the source (index shifts down)', () => {
    // [A B C D], drag A(0) after B(1): remove A → [B C D], insert after B → idx 1
    expect(dropIndex(1, true, 0)).toBe(1);
  });
  it('drops before a target below the source', () => {
    expect(dropIndex(2, false, 0)).toBe(1); // remove A → target C at 1, before → 1
  });
  it('drops before a target above the source (no shift)', () => {
    // [A B C D], drag D(3) before B(1): remove D → [A B C], before B → idx 1
    expect(dropIndex(1, false, 3)).toBe(1);
  });
  it('drops after a target above the source', () => {
    expect(dropIndex(1, true, 3)).toBe(2);
  });
});

describe('startHeaderDrag — threshold and guards', () => {
  it('does nothing before the 5px threshold', () => {
    const { mtx } = colSetup();
    const onreorder = startCol(mtx);
    document.dispatchEvent(pev('pointermove', 3, 3));
    expect(fly()).toBeNull();
    document.dispatchEvent(pev('pointerup', 3, 3));
    expect(onreorder).not.toHaveBeenCalled();
  });

  it('ignores non-left buttons', () => {
    const { mtx, headers } = colSetup();
    const onreorder = vi.fn();
    startHeaderDrag(pev('pointerdown', 0, 0, { button: 1 }), {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder,
    });
    _setElementFromPoint(() => headers[1]);
    document.dispatchEvent(pev('pointermove', 150, 20));
    expect(fly()).toBeNull();
  });
});

describe('startHeaderDrag — move + drop-line', () => {
  it('past the midline marks dropafter and reorders after (col = horizontal split)', () => {
    const { mtx, headers, grip } = colSetup();
    _setElementFromPoint(() => headers[1]); // header 1 spans 100..200, mid 150
    const onreorder = vi.fn();
    const down = pev('pointerdown', 0, 0);
    grip.dispatchEvent(down); // set ev.target so the fly clones its header
    startHeaderDrag(down, {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder,
    });
    document.dispatchEvent(pev('pointermove', 170, 20)); // past mid → after
    expect(headers[1].classList.contains('dropafter')).toBe(true);
    expect(headers[1].classList.contains('dropbefore')).toBe(false);
    expect(fly()).not.toBeNull();
    document.dispatchEvent(pev('pointerup', 170, 20));
    expect(onreorder).toHaveBeenCalledWith(0, 1);
  });

  it('before the midline marks dropbefore', () => {
    const { mtx, headers } = colSetup();
    _setElementFromPoint(() => headers[2]); // spans 200..300, mid 250
    const onreorder = vi.fn();
    startHeaderDrag(pev('pointerdown', 0, 0), {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder,
    });
    document.dispatchEvent(pev('pointermove', 220, 20)); // before mid
    expect(headers[2].classList.contains('dropbefore')).toBe(true);
    document.dispatchEvent(pev('pointerup', 220, 20));
    expect(onreorder).toHaveBeenCalledWith(0, 1); // remove 0 → target at 1, before → 1
  });

  it('vertical split for row headers', () => {
    const mtx = document.createElement('div');
    mtx.className = 'mtx';
    const h0 = document.createElement('button');
    const h1 = document.createElement('button');
    h0.className = h1.className = 'mtx-c mtx-rowh';
    h0.appendChild(document.createElement('span'));
    mtx.append(h0, h1);
    document.body.appendChild(mtx);
    stubRect(h0, { left: 0, top: 0, width: 80, height: 40 });
    stubRect(h1, { left: 0, top: 40, width: 80, height: 40 }); // mid 60
    _setElementFromPoint(() => h1);
    const onreorder = vi.fn();
    startHeaderDrag(pev('pointerdown', 0, 0), {
      axis: 'row',
      fromIndex: 0,
      headerSel: '.mtx-rowh',
      container: mtx,
      onreorder,
    });
    document.dispatchEvent(pev('pointermove', 20, 70)); // y past mid 60 → after
    expect(h1.classList.contains('dropafter')).toBe(true);
    document.dispatchEvent(pev('pointerup', 20, 70));
    expect(onreorder).toHaveBeenCalledWith(0, 1);
  });

  it('ignores the source header itself and clears the line when leaving', () => {
    const { mtx, headers } = colSetup();
    let below: Element | null = headers[1];
    _setElementFromPoint(() => below);
    const onreorder = vi.fn();
    startHeaderDrag(pev('pointerdown', 0, 0), {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder,
    });
    document.dispatchEvent(pev('pointermove', 150, 20));
    expect(headers[1].classList.contains('dropbefore')).toBe(true);
    below = headers[0]; // back over the source header → no indicator, no drop
    document.dispatchEvent(pev('pointermove', 20, 20));
    expect(headers[1].classList.contains('dropbefore')).toBe(false);
    expect([...mtx.querySelectorAll('.dropbefore,.dropafter')]).toHaveLength(0);
    document.dispatchEvent(pev('pointerup', 20, 20));
    expect(onreorder).not.toHaveBeenCalled();
  });

  it('skips the ∅ (mtx-untag) header', () => {
    const { mtx, headers } = colSetup();
    headers[1].classList.add('mtx-untag');
    _setElementFromPoint(() => headers[1]);
    const onreorder = vi.fn();
    startHeaderDrag(pev('pointerdown', 0, 0), {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder,
    });
    document.dispatchEvent(pev('pointermove', 150, 20));
    expect(headers[1].classList.contains('dropbefore')).toBe(false);
    document.dispatchEvent(pev('pointerup', 150, 20));
    expect(onreorder).not.toHaveBeenCalled();
  });

  it('snapshots history exactly once, right before the reorder', () => {
    const snap = vi.spyOn(history, 'pushGestureSnapshot');
    const { mtx, headers } = colSetup();
    _setElementFromPoint(() => headers[1]);
    const onreorder = vi.fn(() => expect(snap).toHaveBeenCalledTimes(1));
    startHeaderDrag(pev('pointerdown', 0, 0), {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder,
    });
    document.dispatchEvent(pev('pointermove', 170, 20));
    document.dispatchEvent(pev('pointerup', 170, 20));
    expect(snap).toHaveBeenCalledTimes(1);
    expect(onreorder).toHaveBeenCalledTimes(1);
  });
});

describe('startHeaderDrag — pointercancel (D12)', () => {
  it('restores and never reorders or snapshots', () => {
    const snap = vi.spyOn(history, 'pushGestureSnapshot');
    const { mtx, headers } = colSetup();
    _setElementFromPoint(() => headers[1]);
    const onreorder = vi.fn();
    startHeaderDrag(pev('pointerdown', 0, 0), {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder,
    });
    document.dispatchEvent(pev('pointermove', 170, 20));
    document.dispatchEvent(pev('pointercancel', 170, 20));
    expect(onreorder).not.toHaveBeenCalled();
    expect(snap).not.toHaveBeenCalled();
    expect(fly()).toBeNull();
    expect([...mtx.querySelectorAll('.dropbefore,.dropafter')]).toHaveLength(0);
    expect(document.documentElement.style.userSelect).toBe('');
  });
});

// Same zoomed-space rule as the card engine: the fly is a fixed child of a zoomed <body>.
describe('startHeaderDrag — zoomed space', () => {
  afterEach(() => applyZoom(1));

  it('positions and sizes the header fly for the cursor at 150%', () => {
    applyZoom(1.5);
    const { mtx, grip } = colSetup();
    const down = pev('pointerdown', 0, 0);
    grip.dispatchEvent(down); // set ev.target so the fly clones its header
    startHeaderDrag(down, {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder: vi.fn(),
    });
    document.dispatchEvent(pev('pointermove', 900, 300));
    const f = fly();
    expect(parseFloat(f?.style.left ?? '') * 1.5).toBeCloseTo(882, 6); // 900 - 18
    expect(parseFloat(f?.style.top ?? '') * 1.5).toBeCloseTo(288, 6); // 300 - 12
    expect(parseFloat(f?.style.width ?? '') * 1.5).toBeCloseTo(100, 6); // header's viewport width
  });

  it('is unchanged at zoom 1', () => {
    const { mtx, grip } = colSetup();
    const down = pev('pointerdown', 0, 0);
    grip.dispatchEvent(down); // set ev.target so the fly clones its header
    startHeaderDrag(down, {
      axis: 'col',
      fromIndex: 0,
      headerSel: '.mtx-colh',
      container: mtx,
      onreorder: vi.fn(),
    });
    document.dispatchEvent(pev('pointermove', 900, 300));
    expect(fly()?.style.left).toBe('882px');
    expect(fly()?.style.top).toBe('288px');
    expect(fly()?.style.width).toBe('100px');
  });
});
