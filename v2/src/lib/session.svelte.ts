import type { SectionView } from './visible-cards';
import type { Section } from './types';
import type { Scope } from './variable-graph';

/**
 * D19 session study state, keyed by section id (`live` by card id). This is view-only,
 * per-session scratch state — shuffle order, search query, archive-view toggle, Study collapse,
 * and the session-layer slot values (v1 LIVE) — and is NEVER persisted or exported (no App.svelte
 * effect reads it). Entering Study wipes the shuffle and live layers (`enterStudy`); search, the
 * archive view and collapse survive that, as in v1. Switching or creating a notebook wipes
 * everything via `resetSession`.
 */
export const session: {
  shuf: Record<string, string[]>;
  search: Record<string, string>;
  showArch: Record<string, boolean>;
  collapsed: Record<string, boolean>;
  live: Record<string, Scope>;
} = $state({
  shuf: {},
  search: {},
  showArch: {},
  collapsed: {},
  live: {},
});

/**
 * The section's view state as the pure render/cursor functions want it. Called from a $derived (or
 * a key handler) so every field read stays tracked.
 */
export function sessionView(sectionId: string): SectionView {
  return {
    search: session.search[sectionId] ?? '',
    showArch: session.showArch[sectionId] === true,
    shuffle: session.shuf[sectionId] ?? null,
    collapsed: session.collapsed[sectionId] === true,
  };
}

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

/** Wipe all session study state (notebook switch / create). */
export function resetSession(): void {
  session.shuf = {};
  session.search = {};
  session.showArch = {};
  session.collapsed = {};
  session.live = {};
}
