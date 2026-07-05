import { describe, it, expect } from 'vitest';
import {
  createNotebook,
  addSection,
  renameSection,
  deleteSection,
  moveSection,
  addCard,
  deleteCard,
  moveCard,
  addSlot,
  deleteSlot,
  moveCardBefore,
  moveSectionBefore,
} from './notebook-ops';

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
