import { toZoomedSpace } from './zoom';

/** Sidebar width bounds shared by the resizer and preference restore. */
export function clampSideW(x: number): number {
  return Math.max(220, Math.min(560, x));
}

/**
 * Sidebar width for a resizer drag at viewport x. `--sidew` is a CSS width inside the zoomed
 * <body>, so the pointer coordinate is converted before it is clamped and written — otherwise the
 * rendered edge lands `zoom` times past the cursor.
 */
export function sideWidthAt(clientX: number, zoom: number): number {
  return clampSideW(toZoomedSpace(clientX, zoom));
}

/** Parse the persisted `side_width` preference; null when absent or malformed. */
export function parseSideWidthPref(raw: string | null): number | null {
  if (raw === null) return null;
  const w = parseInt(raw, 10);
  return Number.isFinite(w) ? clampSideW(w) : null;
}
