import { CARD_STATE_KEY } from './card-done';
import { cardMatchesSearch } from './services';
import type { ReaderStateMap } from './db';
import type { Card, Section } from './types';

const PIN_TAG = 'pinned';

/** Toggle a card's D20 archived flag; the flag is absent (not `false`) when off (v1 70-events.js:113). */
export function setArchived(card: Card, on: boolean): void {
  if (on) card.archived = true;
  else delete card.archived;
}

/** Archive-badge count for the study bar (v1 60-stage.js:152). */
export function archivedCount(section: Section): number {
  return section.cards.filter((c) => c.archived).length;
}

/**
 * Study-grid cards for a section (v1 60-stage.js:159). Archive is a swap, not a merge: the archive
 * view shows ONLY archived cards, the live view ONLY non-archived. Search then filters whichever
 * list is shown.
 */
export function visibleCards(section: Section, showArch: boolean, q: string): Card[] {
  return section.cards.filter(
    (c) => (showArch ? !!c.archived : !c.archived) && cardMatchesSearch(c, q),
  );
}

/** Toggle the `pinned` tag (v1 70-events.js:108). v2 has no cats registry, so no global sync. */
export function togglePin(card: Card): void {
  const tags = card.tags ?? [];
  const i = tags.indexOf(PIN_TAG);
  card.tags = i >= 0 ? tags.filter((t) => t !== PIN_TAG) : [...tags, PIN_TAG];
}

export function isPinned(card: Card): boolean {
  return card.tags?.includes(PIN_TAG) ?? false;
}

/**
 * Toggle `_flip` per flip-capable card, marking the back seen (v1 80-actions.js:4). Per-card toggle,
 * NOT a global set-all-same. Writes the card-state bucket CardView reads (`state[CARD_STATE_KEY]`);
 * returns a new map, never mutating the input.
 */
export function flipAllCards(section: Section, state: ReaderStateMap): ReaderStateMap {
  const next: ReaderStateMap = { ...state };
  for (const card of section.cards) {
    if (!card.verbs?.flip) continue;
    const prevCard = state[card.id] ?? {};
    const prevBucket = prevCard[CARD_STATE_KEY] ?? {};
    next[card.id] = {
      ...prevCard,
      [CARD_STATE_KEY]: { ...prevBucket, flipped: prevBucket.flipped !== true, seenBack: true },
    };
  }
  return next;
}

/**
 * Clear the section's cards' reader-state entries entirely (v1 80-actions.js:5 keepDocState). The
 * `archived` flag is a Card doc field (D20), so it is untouched; the caller also clears shuffle.
 * Returns a new map, never mutating the input.
 */
export function resetSectionState(section: Section, state: ReaderStateMap): ReaderStateMap {
  const next: ReaderStateMap = { ...state };
  for (const card of section.cards) delete next[card.id];
  return next;
}
