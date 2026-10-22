// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createNotebook,
  addSection,
  renameSection,
  deleteSection,
  moveSection,
  addCard,
  deleteCard,
  duplicateCard,
  moveCard,
  addSlot,
  deleteSlot,
  moveCardBefore,
  moveSectionBefore,
  addChapter,
  sectionsOfChapter,
  chapterOf,
  reorderSectionsByValueIndex,
} from './notebook-ops';
import type { Notebook } from './types';

/** Layout: S0 | div1 | S1 S2 | div2 | S3 */
function chapteredNotebook(): Notebook {
  const nb = createNotebook('Chapters');
  nb.sections[0].name = 'S0';
  addChapter(nb, 'Part I');
  addSection(nb, 'S1');
  addSection(nb, 'S2');
  addChapter(nb, 'Part II');
  addSection(nb, 'S3');
  return nb;
}

describe('createNotebook', () => {
  it('creates a named notebook with one empty section', () => {
    const nb = createNotebook('Fresh');
    expect(nb.name).toBe('Fresh');
    expect(nb.sections).toHaveLength(1);
    expect(nb.sections[0].notebookId).toBe(nb.id);
    expect(nb.sections[0].cards).toEqual([]);
  });
});

describe('section ops', () => {
  it('addSection appends with the next position', () => {
    const nb = createNotebook('N');
    const s = addSection(nb, 'Two');
    expect(nb.sections).toHaveLength(2);
    expect(s.name).toBe('Two');
    expect(nb.sections.map((x) => x.position)).toEqual([0, 1]);
  });

  it('renameSection changes the name', () => {
    const nb = createNotebook('N');
    renameSection(nb, nb.sections[0].id, 'Renamed');
    expect(nb.sections[0].name).toBe('Renamed');
  });

  it('deleteSection removes it and renumbers positions', () => {
    const nb = createNotebook('N');
    addSection(nb, 'B');
    addSection(nb, 'C');
    deleteSection(nb, nb.sections[1].id);
    expect(nb.sections.map((s) => s.name)).toEqual(['Section 1', 'C']);
    expect(nb.sections.map((s) => s.position)).toEqual([0, 1]);
  });

  it('moveSection swaps neighbors and clamps at the edges', () => {
    const nb = createNotebook('N');
    addSection(nb, 'B');
    const first = nb.sections[0].id;
    moveSection(nb, first, 1);
    expect(nb.sections[1].id).toBe(first);
    moveSection(nb, first, 1);
    expect(nb.sections[1].id).toBe(first);
    expect(nb.sections.map((s) => s.position)).toEqual([0, 1]);
  });
});

describe('card ops', () => {
  it('addCard creates a card with one text slot', () => {
    const nb = createNotebook('N');
    const card = addCard(nb, nb.sections[0].id);
    expect(nb.sections[0].cards).toHaveLength(1);
    expect(card.sectionId).toBe(nb.sections[0].id);
    expect(card.slots).toHaveLength(1);
    expect(card.slots[0].type).toBe('text');
  });

  it('deleteCard removes and renumbers', () => {
    const nb = createNotebook('N');
    const sid = nb.sections[0].id;
    const a = addCard(nb, sid);
    addCard(nb, sid);
    deleteCard(nb, a.id);
    expect(nb.sections[0].cards).toHaveLength(1);
    expect(nb.sections[0].cards[0].position).toBe(0);
  });

  it('moveCard reorders within its section', () => {
    const nb = createNotebook('N');
    const sid = nb.sections[0].id;
    const a = addCard(nb, sid);
    const b = addCard(nb, sid);
    moveCard(nb, a.id, 1);
    expect(nb.sections[0].cards.map((c) => c.id)).toEqual([b.id, a.id]);
  });
});

describe('slot ops', () => {
  it('addSlot appends a registry-created slot of the given type', () => {
    const nb = createNotebook('N');
    const card = addCard(nb, nb.sections[0].id);
    const slot = addSlot(nb, card.id, 'slider');
    expect(slot.type).toBe('slider');
    expect(slot.props).toMatchObject({ key: 'a', value: 50 });
    expect(card.slots.map((s) => s.type)).toEqual(['text', 'slider']);
  });

  it('addSlot to the back face targets card.back', () => {
    const nb = createNotebook('N');
    const card = addCard(nb, nb.sections[0].id);
    const slot = addSlot(nb, card.id, 'text', 'back');
    expect(card.back).toHaveLength(1);
    expect(card.back![0].id).toBe(slot.id);
  });

  it('addSlot throws for an unknown type', () => {
    const nb = createNotebook('N');
    const card = addCard(nb, nb.sections[0].id);
    expect(() => addSlot(nb, card.id, 'nope')).toThrow(/unknown slot type/i);
  });

  it('deleteSlot removes from either face', () => {
    const nb = createNotebook('N');
    const card = addCard(nb, nb.sections[0].id);
    const back = addSlot(nb, card.id, 'text', 'back');
    deleteSlot(nb, card.id, card.slots[0].id);
    deleteSlot(nb, card.id, back.id);
    expect(card.slots).toEqual([]);
    expect(card.back).toEqual([]);
  });
});

describe('moveCardBefore', () => {
  it('reorders within a section (insert before target)', () => {
    const nb = createNotebook('N');
    const sid = nb.sections[0].id;
    const a = addCard(nb, sid);
    const b = addCard(nb, sid);
    const c = addCard(nb, sid);
    moveCardBefore(nb, c.id, sid, a.id);
    expect(nb.sections[0].cards.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
    expect(nb.sections[0].cards.map((x) => x.position)).toEqual([0, 1, 2]);
  });

  it('accounts for removal when source precedes target', () => {
    const nb = createNotebook('N');
    const sid = nb.sections[0].id;
    const a = addCard(nb, sid);
    const b = addCard(nb, sid);
    const c = addCard(nb, sid);
    moveCardBefore(nb, a.id, sid, c.id);
    expect(nb.sections[0].cards.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
  });

  it('moves across sections and updates sectionId', () => {
    const nb = createNotebook('N');
    const s2 = addSection(nb, 'Two');
    const a = addCard(nb, nb.sections[0].id);
    moveCardBefore(nb, a.id, s2.id, null);
    expect(nb.sections[0].cards).toEqual([]);
    expect(s2.cards.map((x) => x.id)).toEqual([a.id]);
    expect(s2.cards[0].sectionId).toBe(s2.id);
  });

  it('null target appends to the end', () => {
    const nb = createNotebook('N');
    const sid = nb.sections[0].id;
    const a = addCard(nb, sid);
    addCard(nb, sid);
    moveCardBefore(nb, a.id, sid, null);
    expect(nb.sections[0].cards[1].id).toBe(a.id);
  });
});

describe('moveSectionBefore', () => {
  it('reorders sections', () => {
    const nb = createNotebook('N');
    const b = addSection(nb, 'B');
    const c = addSection(nb, 'C');
    moveSectionBefore(nb, c.id, nb.sections[0].id);
    expect(nb.sections.map((s) => s.id)[0]).toBe(c.id);
    expect(nb.sections.map((s) => s.position)).toEqual([0, 1, 2]);
    moveSectionBefore(nb, b.id, null);
    expect(nb.sections[2].id).toBe(b.id);
  });
});

describe('reorderSectionsByValueIndex', () => {
  function flat(): Notebook {
    const nb = createNotebook('N');
    nb.sections[0].name = 'A';
    addSection(nb, 'B');
    addSection(nb, 'C');
    addSection(nb, 'D');
    return nb;
  }
  const names = (nb: Notebook) => nb.sections.map((s) => s.name);

  it('moves a value forward past a later one (to = splice slot after removal)', () => {
    const nb = flat();
    reorderSectionsByValueIndex(nb, 0, 1); // A after B → [B,A,C,D]
    expect(names(nb)).toEqual(['B', 'A', 'C', 'D']);
    expect(nb.sections.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it('moves a value backward before an earlier one', () => {
    const nb = flat();
    reorderSectionsByValueIndex(nb, 3, 1); // remove D → [A,B,C], insert at 1 → [A,D,B,C]
    expect(names(nb)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('appends to the end when to lands past the last remaining value', () => {
    const nb = flat();
    reorderSectionsByValueIndex(nb, 0, 3); // A to the end → [B,C,D,A]
    expect(names(nb)).toEqual(['B', 'C', 'D', 'A']);
  });

  it('maps value indices across dividers and keeps dividers in place', () => {
    // Layout: S0 | div1 | S1 S2 | div2 | S3 — values [S0,S1,S2,S3]
    const nb = chapteredNotebook();
    reorderSectionsByValueIndex(nb, 0, 1); // S0 after S1 among values → before S2 in full array
    expect(names(nb)).toEqual(['Part I', 'S1', 'S0', 'S2', 'Part II', 'S3']);
  });

  it('append past the last value inserts before a trailing divider, preserving it', () => {
    // Layout: S0 | div1 | S1 | div2 (trailing) — values [S0,S1]
    const nb = createNotebook('N');
    nb.sections[0].name = 'S0';
    addChapter(nb, 'Part I');
    addSection(nb, 'S1');
    addChapter(nb, 'Part II');
    reorderSectionsByValueIndex(nb, 0, 1); // S0 to the end of values → after S1, before the trailing divider
    expect(names(nb)).toEqual(['Part I', 'S1', 'S0', 'Part II']);
  });

  it('is a no-op for an out-of-range from', () => {
    const nb = flat();
    reorderSectionsByValueIndex(nb, 9, 0);
    expect(names(nb)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('chapters', () => {
  it('addChapter appends a divider section with no cards', () => {
    const nb = createNotebook('N');
    const div = addChapter(nb, 'Part I');
    expect(div.kind).toBe('divider');
    expect(div.name).toBe('Part I');
    expect(div.position).toBe(1);
    expect(div.cards).toEqual([]);
    expect(nb.sections[1]).toBe(div);
  });

  it('addChapter defaults the name', () => {
    const nb = createNotebook('N');
    const div = addChapter(nb);
    expect(div.name).toBeTruthy();
  });

  it('sectionsOfChapter returns the run after the divider until the next divider', () => {
    const nb = chapteredNotebook();
    const [, div1, s1, s2, div2, s3] = nb.sections;
    expect(sectionsOfChapter(nb, div1.id).map((s) => s.name)).toEqual(['S1', 'S2']);
    expect(sectionsOfChapter(nb, div2.id).map((s) => s.name)).toEqual(['S3']);
    expect(s1.kind).toBeUndefined();
    expect(s2.kind).toBeUndefined();
    expect(s3.kind).toBeUndefined();
  });

  it('sectionsOfChapter of a trailing divider is empty', () => {
    const nb = createNotebook('N');
    const div = addChapter(nb);
    expect(sectionsOfChapter(nb, div.id)).toEqual([]);
  });

  it('sectionsOfChapter of an unknown id is empty', () => {
    const nb = chapteredNotebook();
    expect(sectionsOfChapter(nb, 'nope')).toEqual([]);
  });

  it('chapterOf returns the contiguous non-divider run around a section', () => {
    const nb = chapteredNotebook();
    const [s0, , s1, s2, , s3] = nb.sections;
    expect(chapterOf(nb, s0.id).map((s) => s.name)).toEqual(['S0']);
    expect(chapterOf(nb, s1.id).map((s) => s.name)).toEqual(['S1', 'S2']);
    expect(chapterOf(nb, s2.id).map((s) => s.name)).toEqual(['S1', 'S2']);
    expect(chapterOf(nb, s3.id).map((s) => s.name)).toEqual(['S3']);
  });

  it('chapterOf of an unknown id is empty', () => {
    const nb = chapteredNotebook();
    expect(chapterOf(nb, 'nope')).toEqual([]);
  });

  it('chapterOf spans the whole notebook when there are no dividers', () => {
    const nb = createNotebook('N');
    addSection(nb, 'B');
    expect(chapterOf(nb, nb.sections[0].id)).toHaveLength(2);
  });

  it('deleteSection removes a divider like any section', () => {
    const nb = chapteredNotebook();
    const div1 = nb.sections[1];
    deleteSection(nb, div1.id);
    expect(nb.sections.some((s) => s.id === div1.id)).toBe(false);
    expect(nb.sections.map((s) => s.position)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('divider card guards', () => {
  it('addCard throws for a divider section', () => {
    const nb = createNotebook('N');
    const div = addChapter(nb);
    expect(() => addCard(nb, div.id)).toThrow(/divider/i);
    expect(div.cards).toEqual([]);
  });

  it('moveCardBefore into a divider is a no-op', () => {
    const nb = chapteredNotebook();
    const s0 = nb.sections[0];
    const div1 = nb.sections[1];
    const card = addCard(nb, s0.id);
    moveCardBefore(nb, card.id, div1.id, null);
    expect(div1.cards).toEqual([]);
    expect(s0.cards.map((c) => c.id)).toEqual([card.id]);
    expect(card.sectionId).toBe(s0.id);
  });
});

describe('duplicateCard (v1 dupfurn)', () => {
  function seeded() {
    const nb = createNotebook('Dup');
    const sec = nb.sections[0];
    const card = addCard(nb, sec.id);
    card.w = 6;
    card.accent = '#ff0000';
    card.tags = ['algebra'];
    addCard(nb, sec.id);
    return { nb, sec, card };
  }

  it('inserts the copy directly below with fresh card and slot ids', () => {
    const { nb, sec, card } = seeded();
    const copy = duplicateCard(nb, card.id)!;
    expect(copy).toBeDefined();
    expect(sec.cards[1].id).toBe(copy.id);
    expect(copy.id).not.toBe(card.id);
    expect(copy.sectionId).toBe(sec.id);
    const srcIds = new Set(card.slots.map((s) => s.id));
    for (const s of copy.slots) expect(srcIds.has(s.id)).toBe(false);
    expect(sec.cards.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('carries content, variety accent, type, tags and width', () => {
    const { nb, card } = seeded();
    card.slots[0].props = { text: 'hello' };
    const copy = duplicateCard(nb, card.id)!;
    expect(copy.slots.map((s) => ({ type: s.type, props: s.props }))).toEqual(
      card.slots.map((s) => ({ type: s.type, props: s.props })),
    );
    expect(copy.w).toBe(6);
    expect(copy.accent).toBe('#ff0000');
    expect(copy.typeId).toBe(card.typeId);
    expect(copy.tags).toEqual(['algebra']);
  });

  it('deep-copies: editing the copy leaves the source untouched', () => {
    const { nb, card } = seeded();
    const copy = duplicateCard(nb, card.id)!;
    (copy.slots[0].props as { text: string }).text = 'changed';
    expect((card.slots[0].props as { text: string }).text).not.toBe('changed');
  });

  it('duplicates back-face slots with fresh ids', () => {
    const { nb, card } = seeded();
    card.verbs = { flip: true };
    card.back = [{ id: 'bk1', type: 'text', props: { text: 'b' } }];
    const copy = duplicateCard(nb, card.id)!;
    expect(copy.back).toHaveLength(1);
    expect(copy.back![0].id).not.toBe('bk1');
    expect(copy.back![0].props).toEqual({ text: 'b' });
  });

  it('returns undefined for an unknown id and changes nothing', () => {
    const { nb, sec } = seeded();
    expect(duplicateCard(nb, 'nope')).toBeUndefined();
    expect(sec.cards).toHaveLength(2);
  });
});