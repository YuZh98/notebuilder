export type Rect = { left: number; top: number; width: number; height: number; right: number; bottom: number };

/** Drag-start gesture threshold — v1 90-drag-engine.js:40. */
export function passedThreshold(x0: number, y0: number, x: number, y: number, min = 5): boolean {
  return Math.hypot(x - x0, y - y0) >= min;
}

/** Landing index within a grid, offset past the hovered item's midpoint — v1 90-drag-engine.js:65. */
export function insertionIndex(itemRects: Rect[], overIdx: number, px: number, py: number, horiz: boolean): number {
  const r = itemRects[overIdx];
  const past = horiz ? px > r.left + r.width / 2 : py > r.top + r.height / 2;
  return overIdx + (past ? 1 : 0);
}

/** Card width clamp + 0.05-column snap — v1 100-drag-furniture.js:9. */
export function clampCardW(w: number): number {
  const clamped = Math.max(3, Math.min(12, w));
  return Math.round(clamped * 20) / 20;
}

/** Room width clamp — v1 90-drag-engine.js:157. */
export function clampRoomW(w: number, maxW: number): number {
  return Math.round(Math.max(240, Math.min(maxW, w)));
}

/** Fuse-seam split of a shared width by ratio, clamped to [.15, .85] — v1 100-drag-furniture.js:25. */
export function fuseSplit(total: number, ratio: number): [number, number] {
  const r = Math.max(0.15, Math.min(0.85, ratio));
  return [Math.round(total * r * 100) / 100, Math.round(total * (1 - r) * 100) / 100];
}

/** Inclusive point-in-rect — overDust, v1 10-helpers.js:64. */
export function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Remap an index after moving an item from `from` to `to` — v1 90-drag-engine.js:104. */
export function remapIndex(a: number, from: number, to: number): number {
  if (a === from) return to;
  const shifted = a > from ? a - 1 : a;
  return shifted >= to ? shifted + 1 : shifted;
}
