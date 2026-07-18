import type { Section, Card } from './types';

/**
 * D19 session study state, keyed by section id. This is view-only, per-session scratch state —
 * shuffle order, search query, and archive-view toggle — and is NEVER persisted or exported
 * (no App.svelte effect reads it). Mode and notebook switches wipe it via `resetSession`.
 */
export const session: {
  shuf: Record<string, string[]>;
  search: Record<string, string>;
  showArch: Record<string, boolean>;
} = $state({
  shuf: {},
  search: {},
  showArch: {},
});

/** Fisher-Yates a section's card ids into a view-only order (v1 80-actions.js:3). */
export function shuffleSection(section: Section): void {
  const ids = section.cards.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  session.shuf[section.id] = ids;
}

/** Drop a section's shuffle order, restoring stored card order. */
export function clearShuffle(sectionId: string): void {
  delete session.shuf[sectionId];
}

/** Section cards in study order — the shuffled order when one exists, else stored order. */
export function studyOrder(section: Section): Card[] {
  const order = session.shuf[section.id];
  if (!order) return section.cards;
  return [...section.cards].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Wipe all session study state (mode / notebook switches). */
export function resetSession(): void {
  session.shuf = {};
  session.search = {};
  session.showArch = {};
}
