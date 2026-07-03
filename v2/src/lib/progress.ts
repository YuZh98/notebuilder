import { isCardDone } from './card-done';
import type { Card } from './types';

export function computeProgress(
  cards: Card[],
  statesByCardThenSlot: Record<string, Record<string, Record<string, unknown>>>,
): { done: number; total: number; pct: number } {
  const total = cards.length;
  if (total === 0) return { done: 0, total: 0, pct: 0 };

  let done = 0;
  for (const card of cards) {
    if (isCardDone(card.slots, statesByCardThenSlot[card.id] ?? {})) done++;
  }

  return { done, total, pct: Math.round((done / total) * 100) };
}
