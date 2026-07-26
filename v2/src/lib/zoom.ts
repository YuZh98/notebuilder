/**
 * App zoom — one factor, one writer, one reader.
 *
 * The Cmd/Ctrl +/-/0 shortcut scales the whole surface with `zoom` on <body> (App and the exported
 * Reader both). Everything inside that body then lays out in a space whose pixels render `zoom`
 * times bigger, so any code that takes a viewport coordinate (clientX/clientY, a client rect) and
 * writes it back as a style on a body descendant has to divide by the factor first — that is what
 * `toZoomedSpace` is for.
 */

const MIN = 0.5;
const MAX = 2;
const STEP = 0.1;

type ZoomStyle = { zoom?: string };

/** The next level for a zoom action: ±1 steps by a tenth inside 0.5–2, 0 resets. */
export function nextZoom(current: number, delta: 1 | -1 | 0): number {
  if (delta === 0) return 1;
  return Math.round(Math.min(MAX, Math.max(MIN, current + delta * STEP)) * 10) / 10;
}

/** Toast copy for a zoom change. */
export function zoomLabel(level: number): string {
  return `zoom ${Math.round(level * 100)}%`;
}

/** Write the level onto <body> — the single place the factor is ever set. */
export function applyZoom(level: number, body: HTMLElement = document.body): void {
  (body.style as ZoomStyle).zoom = String(level);
}

/**
 * The factor currently applied, 1 when unset or unusable. Reads the inline style rather than
 * `getComputedStyle` on purpose: this is called from pointermove handlers, and the inline style is
 * the only writer (`applyZoom`), so a computed-style recalc per move would buy nothing.
 */
export function effectiveZoom(body: HTMLElement | null = document.body): number {
  const raw = body ? (body.style as ZoomStyle).zoom : undefined;
  if (!raw) return 1;
  const n = raw.trim().endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Convert a viewport pixel into the zoomed space a body descendant's own styles live in. */
export function toZoomedSpace(px: number, zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? px / zoom : px;
}
