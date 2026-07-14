/** Edge-resize gesture: deltas while dragging, commit on release — v1 90-drag-engine.js:166 + D12 (pointercancel → onCommit(null), caller restores state). */
export function startEdgeResize(
  ev: PointerEvent,
  onDelta: (dx: number, dy: number, mv: PointerEvent) => void,
  onCommit?: (mv: PointerEvent | null) => void,
): void {
  ev.preventDefault();
  ev.stopPropagation();
  const sx = ev.clientX;
  const sy = ev.clientY;
  const move = (mv: PointerEvent) => {
    if (mv.cancelable) mv.preventDefault();
    onDelta(mv.clientX - sx, mv.clientY - sy, mv);
  };
  const finish = (mv: PointerEvent | null) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    onCommit?.(mv);
  };
  const up = (mv: PointerEvent) => finish(mv);
  const cancel = () => finish(null);
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel);
}
