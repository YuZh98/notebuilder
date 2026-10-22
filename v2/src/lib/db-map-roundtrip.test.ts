import { describe, it, expect } from 'vitest';
import { notebookToRows, rowsToNotebook } from './db-map';
import type { Notebook, Section, Card, Slot } from './types';

// Every optional field set. `Required<…>` makes adding a new optional field to the domain types
// a type error here until the fixture (and therefore this round-trip) covers it, so a new field
// can never be silently dropped by the SQLite mapping.
const SLOT: Required<Slot> = {
  id: 'sl1',
  type: 'text',
  props: { text: 'hi', n: 3 },
  verbs: { glow: true, hint: { content: 'think' }, reveal: { key: 'x', op: '>=', val: 2 } },
  w: 6,
  fuse: true,
  fuseW: 40,
};

const BACK_SLOT: Required<Slot> = { ...SLOT, id: 'sl2', w: 12, fuseW: 60 };

const CARD: Required<Card> = {
  id: 'c1',
  sectionId: 's1',
  typeId: 'ct_note',
  position: 0,
  slots: [SLOT],
  verbs: { flip: true, bare: true },
  back: [BACK_SLOT],
  tags: ['a', 'b'],
  accent: '#123456',
  w: 7,
  archived: true,
  draft: true,
};

const SECTION: Required<Section> = {
  id: 's1',
  notebookId: 'nb1',
  name: 'Section',
  position: 0,
  cards: [CARD],
  kind: 'divider',
  locked: true,
  width: 3,
  title: 'Title',
  subtitle: 'Sub',
  folded: true,
  services: { search: true, pin: true },
  svcOrder: ['pin', 'search'],
  svcW: { search: 120 },
};

const NOTEBOOK: Required<Notebook> = {
  cats: ['b', 'a'],
  id: 'nb1',
  name: 'Notebook',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  sections: [SECTION],
  subtitle: 'Subtitle',
  width: 'wide',
};

const roundTrip = (nb: Notebook): Notebook => {
  const rows = notebookToRows(nb);
  // Rows travel through SQLite as JSON text; serialize them to be sure nothing relies on identity.
  const { notebook, sections, cards } = JSON.parse(JSON.stringify(rows)) as typeof rows;
  return rowsToNotebook(notebook, sections, cards);
};

describe('notebookToRows → rowsToNotebook keeps every field', () => {
  it('round-trips a fully-populated notebook exactly', () => {
    expect(roundTrip(NOTEBOOK)).toEqual(NOTEBOOK);
  });

  it('keeps every key at every level (no field silently dropped)', () => {
    const back = roundTrip(NOTEBOOK);
    expect(Object.keys(back).sort()).toEqual(Object.keys(NOTEBOOK).sort());
    expect(Object.keys(back.sections[0]).sort()).toEqual(Object.keys(SECTION).sort());
    const card = back.sections[0].cards[0];
    expect(Object.keys(card).sort()).toEqual(Object.keys(CARD).sort());
    expect(Object.keys(card.slots[0]).sort()).toEqual(Object.keys(SLOT).sort());
    expect(Object.keys(card.back![0]).sort()).toEqual(Object.keys(BACK_SLOT).sort());
  });

  it('persists the card width (Card.w) so resized cards survive a reload', () => {
    const back = roundTrip(NOTEBOOK);
    expect(back.sections[0].cards[0].w).toBe(7);
    const { cards } = notebookToRows(NOTEBOOK);
    expect(JSON.parse(cards[0].data).w).toBe(7);
  });

  it('omits w when the card has no explicit width', () => {
    const { w: _w, ...rest } = CARD;
    const nb: Notebook = { ...NOTEBOOK, sections: [{ ...SECTION, cards: [rest] }] };
    const { cards } = notebookToRows(nb);
    expect(JSON.parse(cards[0].data)).not.toHaveProperty('w');
    expect(roundTrip(nb).sections[0].cards[0]).not.toHaveProperty('w');
  });
});
