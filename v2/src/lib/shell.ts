/** Sidebar width bounds shared by the resizer and preference restore. */
export function clampSideW(x: number): number {
  return Math.max(220, Math.min(560, x));
}

/** Parse the persisted `side_width` preference; null when absent or malformed. */
export function parseSideWidthPref(raw: string | null): number | null {
  if (raw === null) return null;
  const w = parseInt(raw, 10);
  return Number.isFinite(w) ? clampSideW(w) : null;
}
