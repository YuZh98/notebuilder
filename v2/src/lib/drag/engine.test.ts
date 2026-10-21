import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPointerDrag, isDragging, flipGrid, _setElementFromPoint } from './engine';
import type { DragSource, EngineCallbacks } from './engine';
import { dustState } from './dust.svelte';
import { applyZoom } from '../zoom';
import { pev, stubRect } from '../test-utils';

function mkFurn(id: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'furn';
  el.dataset.fid = id;
  el.appendChild(document.createElement('span'));
  return el;
}

function cardSetup() {
  const grid = document.createElement('div');
  grid.className = 'room-grid';
  const a = mkFurn('a');
  const b = mkFurn('b');
  grid.append(a, b);
  document.body.appendChild(grid);
  stubRect(a, { left: 0, top: 0, width: 120, height: 40 });
  stubRect(b, { left: 100, top: 0, width: 100, height: 40 });
  return { grid, a, b };
}

function callbacks(over: Partial<EngineCallbacks> = {}): EngineCallbacks {
  return {
    canDrag: vi.fn(() => true),
    canDrop: vi.fn(() => true),
    onDrop: vi.fn(),
    phWidth: vi.fn(() => 6),
    ...over,
  };
}

function cardSrc(el: Element): DragSource {
  return { kind: 'card', id: 'a', srcEl: el };
}

const fly = () => document.querySelector<HTMLElement>('.drag-fly');
const ph = () => document.querySelector<HTMLElement>('.drag-ph');

// jsdom's document.elementFromPoint throws (no layout), so every test runs on the injected seam.
beforeEach(() => {
  _setElementFromPoint(() => null);
});

afterEach(() => {
  document.dispatchEvent(pev('pointercancel', 0, 0));
  document.dispatchEvent(pev('pointerup', 0, 0));
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); // flush any live click suppressor
  _setElementFromPoint(null);
  dustState.show = false;
  dustState.hot = false;
  document.body.innerHTML = '';
  document.documentElement.style.userSelect = '';
  vi.useRealTimers();
});

describe('startPointerDrag — threshold and guards', () => {
  it('does nothing before the 5px threshold', () => {
    const { a } = cardSetup();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 3, 3));
    expect(fly()).toBeNull();
    expect(ph()).toBeNull();
    expect(isDragging()).toBe(false);
    expect(a.style.display).toBe('');
  });

  it('ignores non-left buttons', () => {
    const { a } = cardSetup();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0, { button: 1 }), callbacks());
    document.dispatchEvent(pev('pointermove', 50, 50));
    expect(fly()).toBeNull();
    expect(isDragging()).toBe(false);
  });

  it('respects canDrag=false — no gesture at all', () => {
    const { a } = cardSetup();
    const cb = callbacks({ canDrag: vi.fn(() => false) });
    const src = cardSrc(a);
    startPointerDrag(src, pev('pointerdown', 0, 0), cb);
    expect(cb.canDrag).toHaveBeenCalledWith(src);
    document.dispatchEvent(pev('pointermove', 50, 50));
    expect(fly()).toBeNull();
    expect(isDragging()).toBe(false);
  });

  it('is a singleton: a second start while dragging is ignored', () => {
    const { a, b } = cardSetup();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 50, 50));
    expect(isDragging()).toBe(true);
    startPointerDrag({ kind: 'card', id: 'b', srcEl: b }, pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 60, 60));
    expect(document.querySelectorAll('.drag-fly').length).toBe(1);
  });
});

describe('startPointerDrag — begin()', () => {
  it('creates the width-pinned fly clone, the classed placeholder, hides the source, shows dust (deletable)', () => {
    const { grid, a } = cardSetup();
    // the placement pass of the same move may relocate the placeholder, so its
    // begin-time position is captured mid-move, at probe time
    const probe = {
      p: null as HTMLElement | null,
      parent: null as Element | null,
      next: null as Node | null,
    };
    _setElementFromPoint(() => {
      probe.p = ph();
      probe.parent = probe.p?.parentElement ?? null;
      probe.next = probe.p?.nextSibling ?? null;
      return null;
    });
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 50, 50));

    const f = fly();
    expect(f).not.toBeNull();
    expect(f?.parentElement).toBe(document.body);
    expect(f?.classList.contains('furn')).toBe(true);
    expect(f?.hasAttribute('data-fid')).toBe(false);
    expect(f?.style.width).toBe('120px');
    expect(f?.style.left).toBe('32px'); // x - 18
    expect(f?.style.top).toBe('36px'); // y - 14

    expect(probe.p?.className).toBe('furn drag-ph');
    expect(probe.p?.style.getPropertyValue('--w')).toBe('6');
    expect(probe.parent).toBe(grid);
    expect(probe.next).toBe(a); // inserted before the source
    expect(a.style.display).toBe('none');
    expect(dustState.show).toBe(true);
    expect(isDragging()).toBe(true);
    expect(document.documentElement.style.userSelect).toBe('none');
  });

  it('does not ghost a product source: no source placeholder, chip stays visible, no dust (v1 :34)', () => {
    const lane = document.createElement('div');
    lane.className = 'store-lane';
    const chip = document.createElement('button');
    chip.className = 'chip prodchip';
    chip.dataset.prod = 'p1';
    lane.appendChild(chip);
    document.body.appendChild(lane);
    stubRect(chip, { width: 60 });
    _setElementFromPoint(() => null); // hovering nothing droppable
    startPointerDrag({ kind: 'product', id: 'p1', srcEl: chip }, pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 50, 50));
    expect(isDragging()).toBe(true);
    expect(fly()).not.toBeNull(); // fly clone still tracks the cursor
    expect(chip.style.display).toBe(''); // never hidden
    expect(lane.querySelector('.drag-ph')).toBeNull(); // no source-lane placeholder
    expect(dustState.show).toBe(false); // product is not deletable
  });

  it('D7: a non-deletable kind never shows the dustbin', () => {
    const grid = document.createElement('div');
    grid.className = 'ce-choice';
    const row = document.createElement('div');
    row.setAttribute('data-qrow', '');
    grid.appendChild(row);
    document.body.appendChild(grid);
    _setElementFromPoint(() => grid); // stay over the ce-choice grid so the placeholder persists
    startPointerDrag({ kind: 'qopt', id: 'q0', srcEl: row }, pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 50, 50));
    expect(isDragging()).toBe(true);
    expect(dustState.show).toBe(false);
    expect(ph()?.className).toBe('ce-opt drag-ph');
  });
});

describe('startPointerDrag — move', () => {
  it('follows the pointer, probes with the fly hidden, marks the grid drop-on', () => {
    const { grid, a, b } = cardSetup();
    const seen: string[] = [];
    _setElementFromPoint(() => {
      seen.push(fly()?.style.display ?? '(no fly)');
      return b;
    });
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 120, 20));
    expect(seen).toEqual(['none']);
    expect(fly()?.style.display).toBe('');
    expect(fly()?.style.left).toBe('102px');
    expect(grid.classList.contains('drop-on')).toBe(true);
  });

  it('computes the insertion index from the hovered item midpoint (horiz)', () => {
    const { grid, a, b } = cardSetup();
    _setElementFromPoint(() => b);
    const cb = callbacks();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 120, 20)); // b spans 100..200, mid 150 → before
    expect(ph()?.nextSibling).toBe(b);
    document.dispatchEvent(pev('pointermove', 160, 20)); // past mid → after
    expect(ph()?.previousSibling).toBe(b);
    document.dispatchEvent(pev('pointerup', 160, 20));
    expect(cb.onDrop).toHaveBeenCalledTimes(1);
    expect(cb.onDrop).toHaveBeenCalledWith(cardSrc(a), { kind: 'grid', grid, idx: 1 });
  });

  it('clears drop-on and detaches the placeholder when leaving the grid', () => {
    const { grid, a, b } = cardSetup();
    let below: Element | null = b;
    _setElementFromPoint(() => below);
    const cb = callbacks();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 120, 20));
    expect(grid.classList.contains('drop-on')).toBe(true);
    below = document.body;
    document.dispatchEvent(pev('pointermove', 400, 400));
    expect(grid.classList.contains('drop-on')).toBe(false);
    expect(ph()).toBeNull(); // detached from the document
    document.dispatchEvent(pev('pointerup', 400, 400));
    expect(cb.onDrop).not.toHaveBeenCalled();
  });

  it('respects canDrop=false: no placeholder in the grid, no drop-on, no target', () => {
    const { grid, a, b } = cardSetup();
    _setElementFromPoint(() => b);
    const cb = callbacks({ canDrop: vi.fn(() => false) });
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 120, 20));
    expect(cb.canDrop).toHaveBeenCalledWith(cardSrc(a), grid);
    expect(grid.classList.contains('drop-on')).toBe(false);
    expect(ph()).toBeNull(); // never attached to the document
    document.dispatchEvent(pev('pointerup', 120, 20));
    expect(cb.onDrop).not.toHaveBeenCalled();
  });

  it('a dragged product drops its .furn placeholder into a target room grid, chip still visible', () => {
    const { grid, a, b } = cardSetup();
    const chip = document.createElement('button');
    chip.className = 'chip prodchip';
    chip.dataset.prod = 'p1';
    document.body.appendChild(chip);
    stubRect(chip, { width: 60 });
    _setElementFromPoint(() => b);
    const cb = callbacks({ phWidth: vi.fn(() => 8) });
    startPointerDrag({ kind: 'product', id: 'p1', srcEl: chip }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 120, 20)); // over b, before its midpoint
    expect(chip.style.display).toBe(''); // source chip stays put
    expect(ph()?.className).toBe('furn drag-ph');
    expect(ph()?.parentElement).toBe(grid); // placeholder lives in the TARGET grid
    expect(ph()?.nextSibling).toBe(b);
    void a;
    document.dispatchEvent(pev('pointerup', 120, 20));
    // product chip is not a grid child, so both furns count: before b → idx 1
    expect(cb.onDrop).toHaveBeenCalledWith(
      { kind: 'product', id: 'p1', srcEl: chip },
      { kind: 'grid', grid, idx: 1 },
    );
  });

  it('emits a lane drop target over an inventory lane and never a source placeholder (v1 :48,89)', () => {
    const lane = document.createElement('div');
    lane.className = 'store-lane';
    lane.dataset.lane = 'write';
    const chip = document.createElement('button');
    chip.className = 'chip prodchip';
    document.body.appendChild(chip);
    document.body.appendChild(lane);
    stubRect(chip, { width: 60 });
    _setElementFromPoint(() => lane);
    const cb = callbacks();
    const src: DragSource = { kind: 'product', id: 'p1', srcEl: chip };
    startPointerDrag(src, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 300, 300));
    expect(lane.classList.contains('drop-on')).toBe(true);
    expect(document.querySelector('.drag-ph')).toBeNull();
    document.dispatchEvent(pev('pointerup', 300, 300));
    expect(cb.onDrop).toHaveBeenCalledWith(src, { kind: 'lane', el: lane });
  });

  it('toggles dust hot via pointInRect and drops on the dustbin', () => {
    const { a } = cardSetup();
    const bin = document.createElement('div');
    bin.id = 'dustbin';
    document.body.appendChild(bin);
    stubRect(bin, { left: 500, top: 500, width: 96, height: 96 });
    _setElementFromPoint(() => document.body);
    const cb = callbacks();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 550, 550));
    expect(dustState.hot).toBe(true);
    document.dispatchEvent(pev('pointermove', 100, 100));
    expect(dustState.hot).toBe(false);
    document.dispatchEvent(pev('pointermove', 550, 550));
    document.dispatchEvent(pev('pointerup', 550, 550));
    expect(cb.onDrop).toHaveBeenCalledWith(cardSrc(a), { kind: 'dust' });
    expect(dustState.show).toBe(false);
    expect(dustState.hot).toBe(false);
  });
});

describe('startPointerDrag — up', () => {
  it('restores the source, removes fly/placeholder, clears the guard, removes listeners', () => {
    const { grid, a, b } = cardSetup();
    _setElementFromPoint(() => b);
    const cb = callbacks();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 120, 20));
    document.dispatchEvent(pev('pointerup', 120, 20));
    expect(cb.onDrop).toHaveBeenCalledTimes(1);
    expect(cb.onDrop).toHaveBeenCalledWith(cardSrc(a), { kind: 'grid', grid, idx: 0 });
    expect(fly()).toBeNull();
    expect(ph()).toBeNull();
    expect(a.style.display).toBe('');
    expect(grid.classList.contains('drop-on')).toBe(false);
    expect(isDragging()).toBe(false);
    expect(document.documentElement.style.userSelect).toBe('');
    // listeners are gone: further moves/ups are inert
    document.dispatchEvent(pev('pointermove', 300, 300));
    expect(fly()).toBeNull();
    document.dispatchEvent(pev('pointerup', 300, 300));
    expect(cb.onDrop).toHaveBeenCalledTimes(1);
  });

  it('a plain click (no threshold) detaches without side effects or drops', () => {
    const { a } = cardSetup();
    const cb = callbacks();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointerup', 1, 1));
    expect(cb.onDrop).not.toHaveBeenCalled();
    expect(isDragging()).toBe(false);
    document.dispatchEvent(pev('pointermove', 50, 50));
    expect(fly()).toBeNull();
  });

  it('suppresses the next click in capture and self-removes', () => {
    const { a, b } = cardSetup();
    _setElementFromPoint(() => b);
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 120, 20));
    document.dispatchEvent(pev('pointerup', 120, 20));
    const heard = vi.fn();
    b.addEventListener('click', heard);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(heard).not.toHaveBeenCalled();
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('click suppression expires after 350ms', () => {
    vi.useFakeTimers();
    const { a, b } = cardSetup();
    _setElementFromPoint(() => b);
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 120, 20));
    document.dispatchEvent(pev('pointerup', 120, 20));
    vi.advanceTimersByTime(350);
    const heard = vi.fn();
    b.addEventListener('click', heard);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe('startPointerDrag — pointercancel (D12)', () => {
  it('fully restores and never calls onDrop', () => {
    const { grid, a, b } = cardSetup();
    _setElementFromPoint(() => b);
    const cb = callbacks();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 120, 20));
    expect(isDragging()).toBe(true);
    document.dispatchEvent(pev('pointercancel', 120, 20));
    expect(cb.onDrop).not.toHaveBeenCalled();
    expect(fly()).toBeNull();
    expect(ph()).toBeNull();
    expect(a.style.display).toBe('');
    expect(grid.classList.contains('drop-on')).toBe(false);
    expect(dustState.show).toBe(false);
    expect(isDragging()).toBe(false);
    expect(document.documentElement.style.userSelect).toBe('');
    document.dispatchEvent(pev('pointermove', 300, 300));
    expect(fly()).toBeNull();
    document.dispatchEvent(pev('pointerup', 300, 300));
    expect(cb.onDrop).not.toHaveBeenCalled();
  });
});

describe('flipGrid', () => {
  it('snaps moved children to their old spot then releases (FLIP), skipping placeholders', () => {
    const grid = document.createElement('div');
    const x = mkFurn('x');
    const y = mkFurn('y');
    const p = document.createElement('div');
    p.className = 'furn drag-ph';
    grid.append(x, y, p);
    document.body.appendChild(grid);
    stubRect(x, { left: 100, top: 0, width: 50, height: 20 });
    stubRect(y, { left: 200, top: 0, width: 50, height: 20 });
    stubRect(p, { left: 300, top: 0, width: 50, height: 20 });

    flipGrid(grid, '.furn', () => {
      grid.insertBefore(y, x); // then pretend layout shifted x right by -60/-10
      stubRect(x, { left: 160, top: 10, width: 50, height: 20 });
    });
    expect(x.style.transform).toBe('translate(-60px,-10px)');
    expect(x.style.transition).toBe('none');
    expect(y.style.transform).toBe(''); // same rect → untouched
    expect(p.style.transform).toBe(''); // placeholder excluded
  });
});

// Under app zoom the fly is a fixed child of a zoomed <body>: a px it writes renders `zoom` times
// bigger, while clientX/Y and client rects are already viewport px. Every such write divides.
describe('zoomed space', () => {
  afterEach(() => applyZoom(1));

  it('positions the fly under the cursor at 150%', () => {
    applyZoom(1.5);
    const { a } = cardSetup();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 1039, 500));
    const f = fly();
    // written × zoom is where it renders: 1039-18 across, 500-14 down.
    expect(parseFloat(f?.style.left ?? '') * 1.5).toBeCloseTo(1021, 6);
    expect(parseFloat(f?.style.top ?? '') * 1.5).toBeCloseTo(486, 6);
  });

  it('keeps the fly the same rendered width as the card it clones', () => {
    applyZoom(1.5);
    const { a } = cardSetup(); // a is stubbed 120px wide in viewport px
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 50, 50));
    expect(parseFloat(fly()?.style.width ?? '') * 1.5).toBeCloseTo(120, 6);
  });

  it('glides FLIP children by the rendered distance, not 1.5× it', () => {
    applyZoom(1.5);
    const grid = document.createElement('div');
    const x = mkFurn('x');
    grid.append(x);
    document.body.appendChild(grid);
    stubRect(x, { left: 100, top: 0, width: 50, height: 20 });
    flipGrid(grid, '.furn', () => stubRect(x, { left: 160, top: 30, width: 50, height: 20 }));
    expect(x.style.transform).toBe('translate(-40px,-20px)'); // (-60,-30) viewport px ÷ 1.5
  });

  it('is unchanged at zoom 1', () => {
    const { a } = cardSetup();
    startPointerDrag(cardSrc(a), pev('pointerdown', 0, 0), callbacks());
    document.dispatchEvent(pev('pointermove', 120, 20));
    expect(fly()?.style.left).toBe('102px');
    expect(fly()?.style.top).toBe('6px');
    expect(fly()?.style.width).toBe('120px');
  });
});
