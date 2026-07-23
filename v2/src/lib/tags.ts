import { findCard } from './notebook-ops';
import type { Notebook } from './types';

// Tags live only on cards (D21 — no cats registry); every operation is a rewrite of card.tags.

export function applyTag(nb: Notebook, cardId: string, tag: string): void {
  const card = findCard(nb, cardId);
  if (!card) return;
  const tags = card.tags ?? [];
  if (!tags.includes(tag)) card.tags = [...tags, tag];
}

export function removeTag(nb: Notebook, cardId: string, tag: string): void {
  const card = findCard(nb, cardId);
  if (!card?.tags) return;
  const tags = card.tags.filter((t) => t !== tag);
  if (tags.length > 0) card.tags = tags;
  else delete card.tags;
}

/**
 * Rename on every card carrying the tag, merging into an existing target name.
 * `pinned` is maintained by the pin button and cannot be renamed (v1 70-events.js:172).
 */
export function renameTag(nb: Notebook, old: string, next: string): boolean {
  const nv = next.trim();
  if (old === 'pinned' || !nv || nv === old) return false;
  let changed = false;
  for (const section of nb.sections) {
    for (const card of section.cards) {
      if (!card.tags?.includes(old)) continue;
      card.tags = card.tags.includes(nv)
        ? card.tags.filter((t) => t !== old)
        : card.tags.map((t) => (t === old ? nv : t));
      changed = true;
    }
  }
  return changed;
}

/** Strip the tag from every card (v1 tagdel), dropping emptied arrays. */
export function deleteTag(nb: Notebook, tag: string): void {
  for (const section of nb.sections) {
    for (const card of section.cards) {
      if (!card.tags?.includes(tag)) continue;
      const tags = card.tags.filter((t) => t !== tag);
      if (tags.length > 0) card.tags = tags;
      else delete card.tags;
    }
  }
}

export function tagUsage(nb: Notebook, tag: string): number {
  let n = 0;
  for (const section of nb.sections) {
    for (const card of section.cards) if (card.tags?.includes(tag)) n++;
  }
  return n;
}
