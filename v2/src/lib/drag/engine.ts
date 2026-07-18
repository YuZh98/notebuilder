import { DRAG_KINDS, type DragKind } from './kinds';
import { passedThreshold, insertionIndex, pointInRect } from './geometry';
import { dustState } from './dust.svelte';

export type DragSource = { kind: DragKind; id: string; srcEl: Element; meta?: Record<string, unknown> };
export type DropTarget =
  | { kind: 'grid'; grid: Element; idx: number }
  | { kind: 'lane'; el: Element }
  | { kind: 'dust' };
export type EngineCallbacks = {
  canDrag: (src: DragSource) => boolean;
  canDrop: (src: DragSource, grid: Element) => boolean;
  onDrop: (src: DragSource, t: DropTarget) => void;
  phWidth: (src: DragSource) => number;
};

let _dragging = false;

export function isDragging(): boolean {
  return _dragging;
}

// jsdom has no layout, so tests inject the hit-test probe.
const domElementFromPoint = (x: number, y: number): Element | null => document.elementFromPoint(x, y);
let elementFromPoint = domElementFromPoint;

export function _setElementFromPoint(fn: ((x: number, y: number) => Element | null) | null): void {
  elementFromPoint = fn ?? domElementFromPoint;
}

/** FLIP glide: neighbours snap to their pre-mutation rect, then release — v1 90-drag-engine.js:10-18. */
export function flipGrid(grid: Element, itemSel: string, mutate: () => void): void {
  const live = () =>
    [...grid.children].filter((e): e is HTMLElement => e.matches(itemSel) && !e.classList.contains('drag-ph'));
  const before = new Map(live().map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  live().forEach((e) => {
    const b = before.get(e);
    if (!b) return;
    const a = e.getBoundingClientRect();
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    if (!dx && !dy) return;
    e.style.transition = 'none';
    e.style.transform = `translate(${dx}px,${dy}px)`;
    requestAnimationFrame(() => {
      e.style.transition = 'transform .15s ease';
      e.style.transform = '';
    });
    setTimeout(() => {
      e.style.transition = '';
      e.style.transform = '';
    }, 200);
  });
}

/** v1 90-drag-engine.js:32 — attribute-selector kinds carry an explicit placeholder class. */
function phClass(kind: DragKind, itemSel: string): string {
  return kind === 'tag' ? 'chip xs' : kind === 'qopt' ? 'ce-opt' : itemSel.slice(1);
}

/**
 * The ONE drag gesture — v1 90-drag-engine.js:19-79. Pure DOM choreography: fly clone,
 * dashed placeholder, FLIP glide, dustbin. The model is only ever touched by `cb.onDrop`.
 */
export function startPointerDrag(src: DragSource, ev: PointerEvent, cb: EngineCallbacks): void {
  if (_dragging) return;
  if (ev.button !== 0) return;
  if (!cb.canDrag(src)) return;
  const spec = DRAG_KINDS[src.kind];
  const { itemSel, gridSels } = spec;
  const startX = ev.clientX;
  const startY = ev.clientY;
  let started = false;
  let fly: HTMLElement | null = null;
  let ph: HTMLElement | null = null;
  let target: DropTarget | null = null;
  let oeRef: HTMLElement | null = null;

  const begin = () => {
    _dragging = true;
    started = true;
    document.documentElement.style.userSelect = 'none';
    const refEl = src.srcEl as HTMLElement;
    oeRef = refEl;
    fly = refEl.cloneNode(true) as HTMLElement;
    fly.classList.add('drag-fly');
    fly.removeAttribute('data-fid');
    fly.style.width = `${refEl.getBoundingClientRect().width}px`;
    document.body.appendChild(fly);
    ph = document.createElement('div');
    ph.className = `${phClass(src.kind, itemSel)} drag-ph`;
    ph.style.setProperty('--w', String(cb.phWidth(src)));
    // v1 90:34 — a store chip stays put; its placeholder only ever appears in a valid target grid.
    if (spec.ghostSource) {
      refEl.parentElement?.insertBefore(ph, refEl);
      refEl.style.display = 'none';
    }
    if (spec.deletable) dustState.show = true; // D7
  };

  const overDust = (x: number, y: number): boolean => {
    if (!dustState.show) return false;
    const d = document.getElementById('dustbin');
    return d != null && pointInRect(x, y, d.getBoundingClientRect());
  };

  const clearHi = () => document.querySelectorAll('.drop-on').forEach((x) => x.classList.remove('drop-on'));
  const items = (grid: Element) => [...grid.children].filter((c) => c.matches(itemSel) && c !== ph && c !== oeRef);

  const onMove = (mv: PointerEvent) => {
    if (!started) {
      if (!passedThreshold(startX, startY, mv.clientX, mv.clientY)) return;
      begin();
    }
    if (mv.cancelable) mv.preventDefault();
    if (fly) {
      fly.style.left = `${mv.clientX - 18}px`;
      fly.style.top = `${mv.clientY - 14}px`;
    }
    dustState.hot = overDust(mv.clientX, mv.clientY);
    if (fly) fly.style.display = 'none';
    const below = elementFromPoint(mv.clientX, mv.clientY);
    if (fly) fly.style.display = '';
    clearHi();

    // v1 90:48 — an inventory lane is a store-remap target, not a reorder grid: highlight it,
    // keep the placeholder out (the chip never ghosts), and stop before grid resolution.
    if (spec.laneSel) {
      const lane = below?.closest(spec.laneSel);
      if (lane) {
        ph?.parentElement?.removeChild(ph);
        lane.classList.add('drop-on');
        target = { kind: 'lane', el: lane };
        return;
      }
    }

    let grid: Element | null = null;
    for (const g of gridSels) {
      const hit = below?.closest(g);
      if (hit) {
        grid = hit;
        break;
      }
    }
    if (grid && cb.canDrop(src, grid)) {
      const it = items(grid);
      let idx = it.length;
      const over = below?.closest(itemSel);
      if (over && over !== ph && over !== oeRef) {
        const oi = it.indexOf(over);
        if (oi >= 0) {
          const rects = it.map((e) => e.getBoundingClientRect());
          idx = insertionIndex(rects, oi, mv.clientX, mv.clientY, spec.horiz(grid));
        }
      }
      const refNode = it[idx] ?? null;
      if (ph && (ph.parentElement !== grid || ph.nextSibling !== refNode)) {
        const g = grid;
        const p = ph;
        flipGrid(g, itemSel, () => g.insertBefore(p, refNode));
      }
      grid.classList.add('drop-on');
      target = { kind: 'grid', grid, idx };
      return;
    }
    ph?.parentElement?.removeChild(ph);
    target = null;
  };

  const detach = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };

  const restore = () => {
    fly?.remove();
    dustState.show = false;
    dustState.hot = false;
    clearHi();
    ph?.parentElement?.removeChild(ph);
    if (oeRef) oeRef.style.display = '';
    _dragging = false;
    document.documentElement.style.userSelect = '';
  };

  const onUp = (uv: PointerEvent) => {
    detach();
    if (!started) return;
    const onDust = overDust(uv.clientX, uv.clientY);
    restore();
    const sw = (ce: MouseEvent) => {
      ce.stopPropagation();
      ce.preventDefault();
      document.removeEventListener('click', sw, true);
    };
    document.addEventListener('click', sw, true);
    setTimeout(() => document.removeEventListener('click', sw, true), 350);
    if (onDust) {
      cb.onDrop(src, { kind: 'dust' });
      return;
    }
    if (target) cb.onDrop(src, target);
  };

  // D12: cancellation restores everything and drops nothing.
  const onCancel = () => {
    detach();
    if (!started) return;
    restore();
  };

  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
}
