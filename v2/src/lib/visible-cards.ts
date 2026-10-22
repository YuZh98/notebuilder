// What the Stage actually renders, as pure functions. Stage/SectionView draw from these and the
// Study keyboard cursor walks them, so "what you see" and "what the cursor can reach" are the same
// code path by construction — a filtered, shuffled or collapsed card can never take the cursor.

import { visibleCards } from './service-ops';
import type { Card, Notebook, Section } from './types';

/** Per-section study view state (session-only): search box, archive view, shuffle, collapse. */
export type SectionView = {
  search: string;
  showArch: boolean;
  shuffle: string[] | null;
  collapsed: boolean;
};

/** Section cards in study order — the shuffled order when one exists, else stored order. */
export function shuffledCards(section: Section, shuffle: string[] | null): Card[] {
  if (!shuffle) return section.cards;
  return [...section.cards].sort((a, b) => shuffle.indexOf(a.id) - shuffle.indexOf(b.id));
}

/**
 * The section rows the Stage renders (v1 60-stage.js:119): a folded chapter divider swallows its
 * sections, the matrix filter drops sections with no matching card, and Study hides a section that
 * would render as nothing at all.
 */
export function visibleSections(
  notebook: Notebook,
  studying: boolean,
  visibleCardIds: Set<string> | null,
): Section[] {
  let chapFold = false;
  const out: Section[] = [];
  for (const s of notebook.sections) {
    const divider = s.kind === 'divider';
    if (!divider && chapFold) continue;
    if (!divider && visibleCardIds !== null && !s.cards.some((c) => visibleCardIds.has(c.id))) {
      continue;
    }
    if (
      !divider &&
      studying &&
      s.cards.length === 0 &&
      !(s.title ?? '').trim() &&
      !(s.subtitle ?? '').trim()
    ) {
      continue;
    }
    if (divider) chapFold = s.folded === true;
    out.push(s);
  }
  return out;
}

/**
 * A section's cards in render order: Study is shuffle order ∩ archive/search ∩ matrix filter
 * (v1 60-stage.js:159-160), Edit applies only the matrix filter. The archive view is a swap, so
 * archived cards ARE rendered (and focusable) while it is on.
 */
export function visibleSectionCards(
  section: Section,
  studying: boolean,
  view: SectionView,
  visibleCardIds: Set<string> | null,
): Card[] {
  if (section.kind === 'divider') return [];
  if (!studying) {
    if (visibleCardIds === null) return section.cards;
    return section.cards.filter((c) => visibleCardIds.has(c.id));
  }
  if (view.collapsed) return [];
  const shown = new Set(visibleCards(section, view.showArch, view.search).map((c) => c.id));
  return shuffledCards(section, view.shuffle).filter(
    (c) => shown.has(c.id) && (visibleCardIds === null || visibleCardIds.has(c.id)),
  );
}
