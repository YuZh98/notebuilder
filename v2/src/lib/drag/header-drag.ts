import { pushGestureSnapshot } from './gesture-history';

// jsdom has no layout, so tests inject the hit-test probe (mirror engine.ts).
const domElementFromPoint = (x: number, y: number): Element | null => document.elementFromPoint(x, y);
let elementFromPoint = domElementFromPoint;

export function _setElementFromPoint(fn: ((x: number, y: number) => Element | null) | null): void {
  elementFromPoint = fn ?? domElementFromPoint;
}

export type HeaderDragOpts = {
  axis: 'row' | 'col';
  fromIndex: number;
  headerSel: string;
  container: Element;
  onreorder: (from: number, to: number) => void;
};

/** Splice destination once fromIndex is removed, then before/after the target — v1 90-drag-engine.js:146-149. */
export function dropIndex(targetIndex: number, after: boolean, fromIndex: number): number {
  const ti = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
  return after ? ti + 1 : ti;
}

let _active = false;

/**
 * Matrix header reorder — a 2D grid can't slot a placeholder without garbling the CSS grid, so this
 * marks the target with a drop-line instead of the 1D FLIP engine (v1 90-drag-engine.js:113-151).
 */
export function startHeaderDrag(ev: PointerEvent, opts: HeaderDragOpts): void {
  if (ev.button != null && ev.button !== 0) return;
  if (_active) return;
  const { axis, fromIndex, headerSel, container, onreorder } = opts;
  const horiz = axis === 'col';
  const sx = ev.clientX;
  const sy = ev.clientY;
  let started = false;
  let fly: HTMLElement | null = null;
  let drop: number | null = null;

  const headers = (): HTMLElement[] =>
    [...container.querySelectorAll(headerSel)].filter((e): e is HTMLElement => e instanceof HTMLElement);
  const clearInd = () =>
    container
      .querySelectorAll(`${headerSel}.dropbefore, ${headerSel}.dropafter`)
      .forEach((x) => x.classList.remove('dropbefore', 'dropafter'));

  const begin = () => {
    started = true;
    _active = true;
    document.documentElement.style.userSelect = 'none';
    const src = (ev.target as Element | null)?.closest('.mtx-c');
    if (src) {
      fly = src.cloneNode(true) as HTMLElement;
      fly.classList.add('drag-fly');
      fly.style.width = `${src.getBoundingClientRect().width}px`;
      document.body.appendChild(fly);
    }
  };

  const onMove = (mv: PointerEvent) => {
    if (!started) {
      if (Math.hypot(mv.clientX - sx, mv.clientY - sy) < 5) return;
      begin();
    }
    if (mv.cancelable) mv.preventDefault();
    if (fly) {
      fly.style.left = `${mv.clientX - 18}px`;
      fly.style.top = `${mv.clientY - 12}px`;
      fly.style.display = 'none';
    }
    const below = elementFromPoint(mv.clientX, mv.clientY);
    if (fly) fly.style.display = '';
    clearInd();
    drop = null;
    const hdr = below?.closest(headerSel) as HTMLElement | null;
    if (!hdr) return;
    const targetIndex = headers().indexOf(hdr);
    if (targetIndex < 0 || targetIndex === fromIndex || hdr.classList.contains('mtx-untag')) return;
    const rc = hdr.getBoundingClientRect();
    const after = horiz ? mv.clientX > rc.left + rc.width / 2 : mv.clientY > rc.top + rc.height / 2;
    hdr.classList.add(after ? 'dropafter' : 'dropbefore');
    drop = dropIndex(targetIndex, after, fromIndex);
  };

  const detach = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };
  const cleanup = () => {
    fly?.remove();
    clearInd();
    _active = false;
    document.documentElement.style.userSelect = '';
  };

  const onUp = () => {
    detach();
    if (!started) return;
    const to = drop;
    cleanup();
    // v1 90:142 — swallow the click the release would otherwise fire on the header.
    const sw = (ce: MouseEvent) => {
      ce.stopPropagation();
      ce.preventDefault();
      document.removeEventListener('click', sw, true);
    };
    document.addEventListener('click', sw, true);
    setTimeout(() => document.removeEventListener('click', sw, true), 350);
    if (to === null) return;
    pushGestureSnapshot();
    onreorder(fromIndex, to);
  };

  // D12: cancellation restores everything and reorders nothing.
  const onCancel = () => {
    detach();
    if (started) cleanup();
  };

  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
}
