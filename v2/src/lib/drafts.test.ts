import { describe, it, expect } from 'vitest';
import {
  markAllDraft,
  clearDraft,
  clearAllDrafts,
  draftCards,
  nextDraft,
  hidingChapter,
} from './drafts';
import type { Card, Notebook, Section } from './types';

const card = (id: string, sectionId: string, position: number, over: Partial<Card> = {}): Card => ({
  id,
  sectionId,
  position,
  slots: [{ id: `${id}_s`, type: 'text', props: { text: id } }],
  ...over,
});

const section = (id: string, cards: Card[], over: Partial<Section> = {}): Section => ({
  id,
  notebookId: 'nb',
  name: id,
  position: 0,
  cards,
  ...over,
});

/** s1: a b · divider d1 · s2: c · s3: (empty) · s4: d e */
function nb(): Notebook {
  return {
    id: 'nb',
    name: 'NB',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sections: [
      section('s1', [card('a', 's1', 0), card('b', 's1', 1)]),
      section('d1', [], { kind: 'divider' }),
      section('s2', [card('c', 's2', 0)]),
      section('s3', []),
      section('s4', [card('d', 's4', 0), card('e', 's4', 1)]),
    ],
  };
}

const ids = (cards: Card[]) => cards.map((c) => c.id);

describe('markAllDraft', () => {
  it('flags every card in every section', () => {
    const n = nb();
    markAllDraft(n);
    expect(n.sections.flatMap((s) => s.cards).every((c) => c.draft === true)).toBe(true);
  });

  it('is a no-op on a notebook without cards', () => {
    const n: Notebook = { ...nb(), sections: [section('s', [])] };
    markAllDraft(n);
    expect(draftCards(n)).toEqual([]);
  });
});

describe('clearDraft', () => {
  it('removes the key entirely (absent, not false) and reports the change', () => {
    const c = card('a', 's1', 0, { draft: true });
    expect(clearDraft(c)).toBe(true);
    expect(c).not.toHaveProperty('draft');
  });

  it('reports false for a card that was not a draft', () => {
    const c = card('a', 's1', 0);
    expect(clearDraft(c)).toBe(false);
    expect(c).not.toHaveProperty('draft');
  });
});

describe('clearAllDrafts', () => {
  it('clears every flag and returns how many it cleared', () => {
    const n = nb();
    markAllDraft(n);
    clearDraft(n.sections[0].cards[0]);
    expect(clearAllDrafts(n)).toBe(4);
    expect(draftCards(n)).toEqual([]);
    for (const c of n.sections.flatMap((s) => s.cards)) expect(c).not.toHaveProperty('draft');
  });

  it('returns 0 when nothing was a draft', () => {
    expect(clearAllDrafts(nb())).toBe(0);
  });
});

describe('draftCards', () => {
  it('lists drafts in document order (sections, then cards), skipping reviewed ones', () => {
    const n = nb();
    markAllDraft(n);
    clearDraft(n.sections[0].cards[1]); // b
    clearDraft(n.sections[4].cards[0]); // d
    expect(ids(draftCards(n))).toEqual(['a', 'c', 'e']);
  });

  it('ignores a draft key that is not exactly true', () => {
    const n = nb();
    (n.sections[0].cards[0] as Record<string, unknown>).draft = false;
    expect(draftCards(n)).toEqual([]);
  });
});

describe('nextDraft', () => {
  function drafted(...draftIds: string[]): Notebook {
    const n = nb();
    for (const c of n.sections.flatMap((s) => s.cards)) if (draftIds.includes(c.id)) c.draft = true;
    return n;
  }

  it('returns null when there are no drafts', () => {
    expect(nextDraft(nb())).toBeNull();
    expect(nextDraft(nb(), 'a')).toBeNull();
  });

  it('without a starting card returns the first draft', () => {
    expect(nextDraft(drafted('c', 'e'))?.id).toBe('c');
    expect(nextDraft(drafted('c', 'e'), null)?.id).toBe('c');
  });

  it('returns the first draft after the given card in document order', () => {
    const n = drafted('a', 'c', 'e');
    expect(nextDraft(n, 'a')?.id).toBe('c');
    expect(nextDraft(n, 'c')?.id).toBe('e');
  });

  it('starts after a card that is not itself a draft', () => {
    expect(nextDraft(drafted('a', 'e'), 'b')?.id).toBe('e');
    expect(nextDraft(drafted('a', 'e'), 'd')?.id).toBe('e');
  });

  it('wraps around to the first draft past the end', () => {
    const n = drafted('a', 'c');
    expect(nextDraft(n, 'c')?.id).toBe('a');
    expect(nextDraft(n, 'e')?.id).toBe('a');
  });

  it('returns the only draft again when it is the starting card', () => {
    expect(nextDraft(drafted('c'), 'c')?.id).toBe('c');
  });

  it('falls back to the first draft when the starting card no longer exists', () => {
    expect(nextDraft(drafted('c', 'e'), 'gone')?.id).toBe('c');
  });
});

describe('hidingChapter', () => {
  it('returns the folded divider whose chapter holds the card', () => {
    const n = nb();
    n.sections[1].folded = true;
    expect(hidingChapter(n, 'c')?.id).toBe('d1');
    expect(hidingChapter(n, 'e')?.id).toBe('d1'); // s3 and s4 sit in the same chapter
  });

  it('returns null when the chapter is open, or the card precedes every divider', () => {
    const n = nb();
    expect(hidingChapter(n, 'c')).toBeNull();
    n.sections[1].folded = true;
    expect(hidingChapter(n, 'a')).toBeNull();
  });

  it('only the nearest divider before the section counts', () => {
    const n = nb();
    n.sections[1].folded = true;
    n.sections.splice(3, 0, section('d2', [], { kind: 'divider' })); // open divider before s3
    expect(hidingChapter(n, 'c')?.id).toBe('d1');
    expect(hidingChapter(n, 'e')).toBeNull();
  });

  it('returns null for an unknown card', () => {
    expect(hidingChapter(nb(), 'nope')).toBeNull();
  });
});
