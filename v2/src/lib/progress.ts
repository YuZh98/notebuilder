import { hasCompletableSlot, isCardDone } from './card-done';
import { chapterOf } from './notebook-ops';
import type { Card, Notebook, Section } from './types';

export type ProgressScope = 'section' | 'chapter' | 'notebook';

/** Resolve which cards a progress slot in `section` counts, per its declared scope. */
export function progressScopeCards(nb: Notebook, section: Section, scope: ProgressScope): Card[] {
  if (scope === 'notebook') return nb.sections.flatMap((s) => s.cards);
  if (scope === 'chapter') return chapterOf(nb, section.id).flatMap((s) => s.cards);
  return section.cards;
}

export function computeProgress(
  cards: Card[],
  statesByCardThenSlot: Record<string, Record<string, Record<string, unknown>>>,
  track?: string[],
): { done: number; total: number; pct: number } {
  const active = cards.filter((c) => !c.archived);
  const tracked =
    track && track.length
      ? active.filter((c) => (c.tags ?? []).some((t) => track.includes(t)))
      : active;
  // v1 pgCount excludes cards with nothing to finish (cardDone === null).
  const counted = tracked.filter((c) => hasCompletableSlot(c));
  const total = counted.length;
  if (total === 0) return { done: 0, total: 0, pct: 0 };

  let done = 0;
  for (const card of counted) {
    if (isCardDone(card, statesByCardThenSlot[card.id] ?? {})) done++;
  }

  return { done, total, pct: Math.round((done / total) * 100) };
}
