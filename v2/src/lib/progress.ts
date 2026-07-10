import { isCardDone } from './card-done';
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
): { done: number; total: number; pct: number } {
  const total = cards.length;
  if (total === 0) return { done: 0, total: 0, pct: 0 };

  let done = 0;
  for (const card of cards) {
    if (isCardDone(card, statesByCardThenSlot[card.id] ?? {})) done++;
  }

  return { done, total, pct: Math.round((done / total) * 100) };
}
