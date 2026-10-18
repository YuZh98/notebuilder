import type { Card, Notebook, Section } from './types';

/*
 * D2d — AI drafts. A notebook made "From AI" arrives with every card flagged `draft`; the author
 * reviews each one (edit it, or accept it as is) before sharing. The flag is local authoring
 * state (types.ts Card.draft): these helpers mutate the notebook in place, and callers push
 * history first so every change is undoable.
 */

const isDraft = (c: Card): boolean => c.draft === true;

/** Flag every card in the notebook as an unreviewed draft. */
export function markAllDraft(nb: Notebook): void {
  for (const s of nb.sections) for (const c of s.cards) c.draft = true;
}

/** Mark one card reviewed. The key is removed (absent, never `false`); true when it was a draft. */
export function clearDraft(card: Card): boolean {
  const was = isDraft(card);
  delete card.draft;
  return was;
}

/** Mark every card reviewed; returns how many drafts were cleared. */
export function clearAllDrafts(nb: Notebook): number {
  let n = 0;
  for (const s of nb.sections) for (const c of s.cards) if (clearDraft(c)) n++;
  return n;
}

/** Draft cards in document order: sections in order, then cards in order. */
export function draftCards(nb: Notebook): Card[] {
  return nb.sections.flatMap((s) => s.cards.filter(isDraft));
}

/**
 * The next draft after `afterCardId` in document order, wrapping around to the first. With no
 * (or an unknown) starting card it is the first draft; null when nothing is left to review.
 */
export function nextDraft(nb: Notebook, afterCardId?: string | null): Card | null {
  const all = nb.sections.flatMap((s) => s.cards);
  const start = afterCardId ? all.findIndex((c) => c.id === afterCardId) : -1;
  for (let k = 1; k <= all.length; k++) {
    const c = all[(start + k) % all.length];
    if (isDraft(c)) return c;
  }
  return null;
}

/**
 * The folded chapter divider that hides this card's section in the Stage (Stage.svelte rows:
 * the nearest divider before a section folds it), or null when the card is on show.
 */
export function hidingChapter(nb: Notebook, cardId: string): Section | null {
  const i = nb.sections.findIndex((s) => s.kind !== 'divider' && s.cards.some((c) => c.id === cardId));
  for (let j = i - 1; j >= 0; j--) {
    const s = nb.sections[j];
    if (s.kind === 'divider') return s.folded === true ? s : null;
  }
  return null;
}
