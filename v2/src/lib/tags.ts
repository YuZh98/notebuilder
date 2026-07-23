import { findCard } from './notebook-ops';
import type { Notebook } from './types';

// Tag identity and order live in `Notebook.cats` (D26, partially reversing D21); membership
// stays on `card.tags`. Every tag mutation flows through here so cats never drifts.

/** First-seen union of card tags — the pre-D26 derivation, kept for old blobs and payloads. */
export function derivedTagUnion(nb: Notebook): string[] {
  const seen: string[] = [];
  for (const section of nb.sections) {
    for (const card of section.cards) {
      for (const t of card.tags ?? []) if (!seen.includes(t)) seen.push(t);
    }
  }
  return seen;
}

function catsOf(nb: Notebook): string[] {
  return (nb.cats ??= derivedTagUnion(nb));
}

function register(nb: Notebook, tag: string): void {
  const cats = catsOf(nb);
  if (!cats.includes(tag)) cats.push(tag);
}

/** Create a free tag — no card carries it yet. Returns whether anything changed. */
export function createTag(nb: Notebook, tag: string): boolean {
  const name = tag.trim();
  if (!name || catsOf(nb).includes(name)) return false;
  nb.cats!.push(name);
  return true;
}

/** Move the tag at `from` to `to`, where `to` indexes the list with the tag removed. */
export function reorderTag(nb: Notebook, from: number, to: number): void {
  const cats = nb.cats;
  if (!cats || from < 0 || from >= cats.length) return;
  const [tag] = cats.splice(from, 1);
  cats.splice(Math.max(0, Math.min(to, cats.length)), 0, tag);
}

export function applyTag(nb: Notebook, cardId: string, tag: string): void {
  const card = findCard(nb, cardId);
  if (!card) return;
  const tags = card.tags ?? [];
  if (!tags.includes(tag)) card.tags = [...tags, tag];
  register(nb, tag);
}

/** Drop the tag from one card. The cats entry stays — the tag survives as a free tag. */
export function removeTag(nb: Notebook, cardId: string, tag: string): void {
  const card = findCard(nb, cardId);
  if (!card?.tags) return;
  const tags = card.tags.filter((t) => t !== tag);
  if (tags.length > 0) card.tags = tags;
  else delete card.tags;
}

/** Comma-input rewrite of one card's tags (v1 tags box); unseen names register in cats. */
export function setCardTags(nb: Notebook, cardId: string, raw: string): void {
  const card = findCard(nb, cardId);
  if (!card) return;
  const tags = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length > 0) card.tags = tags;
  else delete card.tags;
  for (const t of tags) register(nb, t);
}

/**
 * Rename on every card carrying the tag and in cats (position kept), merging into an
 * existing target name. `pinned` is maintained by the pin button and cannot be renamed
 * (v1 70-events.js:172).
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
  const cats = nb.cats;
  const i = cats?.indexOf(old) ?? -1;
  if (cats && i >= 0) {
    if (cats.includes(nv)) cats.splice(i, 1);
    else cats[i] = nv;
    changed = true;
  }
  return changed;
}

/** Strip the tag from every card (v1 tagdel) and from cats, dropping emptied arrays. */
export function deleteTag(nb: Notebook, tag: string): void {
  for (const section of nb.sections) {
    for (const card of section.cards) {
      if (!card.tags?.includes(tag)) continue;
      const tags = card.tags.filter((t) => t !== tag);
      if (tags.length > 0) card.tags = tags;
      else delete card.tags;
    }
  }
  if (nb.cats) nb.cats = nb.cats.filter((t) => t !== tag);
}

export function tagUsage(nb: Notebook, tag: string): number {
  let n = 0;
  for (const section of nb.sections) {
    for (const card of section.cards) if (card.tags?.includes(tag)) n++;
  }
  return n;
}
