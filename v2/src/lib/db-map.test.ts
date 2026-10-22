// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { notebookToRows, rowsToNotebook } from './db-map';
import { derivedTagUnion } from './tags';
import type { Notebook } from './types';

const FULL_NB: Notebook = {
  id: 'nb1',
  name: 'My Notebook',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  sections: [
    {
      id: 's1',
      notebookId: 'nb1',
      name: 'Section One',
      position: 0,
      cards: [
        {
          id: 'c1',
          sectionId: 's1',
          typeId: 'basic',
          position: 0,
          slots: [{ id: 'sl1', type: 'text', props: { content: 'hello' } }],
          verbs: { flip: true },
          tags: ['vocab', 'chapter1'],
        },
        {
          id: 'c2',
          sectionId: 's1',
          typeId: 'cloze',
          position: 1,
          slots: [{ id: 'sl2', type: 'cloze', props: { text: 'world' }, w: 2 }],
          back: [{ id: 'sl3', type: 'text', props: { content: 'answer' } }],
          tags: ['grammar'],
        },
      ],
    },
    {
      id: 's2',
      notebookId: 'nb1',
      name: 'Section Two',
      position: 1,
      cards: [
        {
          id: 'c3',
          sectionId: 's2',
          position: 0,
          slots: [{ id: 'sl4', type: 'image', props: { src: '/img.png' }, fuse: true, fuseW: 3 }],
          verbs: { bare: true },
          back: [{ id: 'sl5', type: 'text', props: { content: 'caption' } }],
          tags: ['images', 'review', 'test'],
        },
      ],
    },
  ],
};

describe('notebookToRows', () => {
  it('produces correct NotebookRow', () => {
    const { notebook } = notebookToRows(FULL_NB);
    expect(notebook).toEqual({
      id: 'nb1',
      name: 'My Notebook',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      data: '{}',
    });
  });

  it('produces correct SectionRows in order', () => {
    const { sections } = notebookToRows(FULL_NB);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({ id: 's1', notebook_id: 'nb1', name: 'Section One', position: 0, data: '{}' });
    expect(sections[1]).toEqual({ id: 's2', notebook_id: 'nb1', name: 'Section Two', position: 1, data: '{}' });
  });

  it('produces correct CardRows with JSON data', () => {
    const { cards } = notebookToRows(FULL_NB);
    expect(cards).toHaveLength(3);

    expect(cards[0]).toEqual({
      id: 'c1',
      section_id: 's1',
      type_id: 'basic',
      position: 0,
      data: JSON.stringify({
        slots: [{ id: 'sl1', type: 'text', props: { content: 'hello' } }],
        verbs: { flip: true },
        tags: ['vocab', 'chapter1'],
      }),
    });

    expect(cards[1]).toEqual({
      id: 'c2',
      section_id: 's1',
      type_id: 'cloze',
      position: 1,
      data: JSON.stringify({
        slots: [{ id: 'sl2', type: 'cloze', props: { text: 'world' }, w: 2 }],
        back: [{ id: 'sl3', type: 'text', props: { content: 'answer' } }],
        tags: ['grammar'],
      }),
    });

    expect(cards[2]).toEqual({
      id: 'c3',
      section_id: 's2',
      type_id: null,
      position: 0,
      data: JSON.stringify({
        slots: [{ id: 'sl4', type: 'image', props: { src: '/img.png' }, fuse: true, fuseW: 3 }],
        verbs: { bare: true },
        back: [{ id: 'sl5', type: 'text', props: { content: 'caption' } }],
        tags: ['images', 'review', 'test'],
      }),
    });
  });

  it('omits verbs/back/tags keys when absent', () => {
    const minimal: Notebook = {
      id: 'nb2',
      name: 'Empty-ish',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      sections: [
        {
          id: 's3',
          notebookId: 'nb2',
          name: 'Only Slots',
          position: 0,
          cards: [
            {
              id: 'c4',
              sectionId: 's3',
              position: 0,
              slots: [{ id: 'sl6', type: 'text', props: {} }],
            },
          ],
        },
      ],
    };
    const { cards } = notebookToRows(minimal);
    const parsed = JSON.parse(cards[0].data);
    expect(parsed).toEqual({ slots: [{ id: 'sl6', type: 'text', props: {} }] });
    expect(parsed).not.toHaveProperty('verbs');
    expect(parsed).not.toHaveProperty('back');
    expect(parsed).not.toHaveProperty('tags');
  });
});

describe('rowsToNotebook', () => {
  it('reassembles sections and cards in position order', () => {
    const { notebook, sections, cards } = notebookToRows(FULL_NB);
    // Shuffle to verify sorting
    const shuffledSections = [sections[1], sections[0]];
    const shuffledCards = [cards[2], cards[0], cards[1]];
    const result = rowsToNotebook(notebook, shuffledSections, shuffledCards);
    expect(result.sections[0].id).toBe('s1');
    expect(result.sections[1].id).toBe('s2');
    expect(result.sections[0].cards[0].id).toBe('c1');
    expect(result.sections[0].cards[1].id).toBe('c2');
    expect(result.sections[1].cards[0].id).toBe('c3');
  });

  it('restores notebookId and sectionId FK fields', () => {
    const { notebook, sections, cards } = notebookToRows(FULL_NB);
    const result = rowsToNotebook(notebook, sections, cards);
    for (const section of result.sections) {
      expect(section.notebookId).toBe('nb1');
      for (const card of section.cards) {
        expect(card.sectionId).toBe(section.id);
      }
    }
  });
});

describe('chrome fields (sections.data / notebooks.data / cards.data accent)', () => {
  const CHROME_NB: Notebook = {
    id: 'nb5',
    name: 'Chrome',
    subtitle: 'A subtitled notebook',
    width: 'wide',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    sections: [
      {
        id: 'd1',
        notebookId: 'nb5',
        name: 'Part I',
        position: 0,
        cards: [],
        kind: 'divider',
      },
      {
        id: 's5',
        notebookId: 'nb5',
        name: 'Fancy Section',
        position: 1,
        cards: [
          {
            id: 'c6',
            sectionId: 's5',
            position: 0,
            slots: [{ id: 'sl8', type: 'text', props: { text: 'hi' } }],
            accent: '#ff6600',
          },
        ],
        locked: true,
        width: 2,
        title: 'Big Title',
        subtitle: 'Small subtitle',
        folded: true,
      },
    ],
  };

  it('serializes section chrome into sections.data JSON', () => {
    const { sections } = notebookToRows(CHROME_NB);
    expect(JSON.parse(sections[0].data)).toEqual({ kind: 'divider' });
    expect(JSON.parse(sections[1].data)).toEqual({
      locked: true,
      width: 2,
      title: 'Big Title',
      subtitle: 'Small subtitle',
      folded: true,
    });
  });

  it('serializes notebook subtitle/width into notebooks.data JSON', () => {
    const { notebook } = notebookToRows(CHROME_NB);
    expect(JSON.parse(notebook.data)).toEqual({ subtitle: 'A subtitled notebook', width: 'wide' });
  });

  it('serializes card accent into cards.data JSON', () => {
    const { cards } = notebookToRows(CHROME_NB);
    expect(JSON.parse(cards[0].data).accent).toBe('#ff6600');
  });

  it('round-trips chrome fields', () => {
    const { notebook, sections, cards } = notebookToRows(CHROME_NB);
    const { cats, ...rest } = rowsToNotebook(notebook, sections, cards);
    expect(rest).toEqual(CHROME_NB);
    expect(cats).toEqual(derivedTagUnion(CHROME_NB));
  });

  it('omits absent chrome keys after round-trip', () => {
    const { notebook, sections, cards } = notebookToRows(FULL_NB);
    const result = rowsToNotebook(notebook, sections, cards);
    expect(result).not.toHaveProperty('subtitle');
    expect(result).not.toHaveProperty('width');
    for (const key of ['kind', 'locked', 'width', 'title', 'subtitle', 'folded']) {
      expect(result.sections[0]).not.toHaveProperty(key);
    }
    expect(result.sections[0].cards[0]).not.toHaveProperty('accent');
  });
});

describe('round-trip', () => {
  it('full notebook with slots, verbs, back, tags survives round-trip', () => {
    const { notebook, sections, cards } = notebookToRows(FULL_NB);
    const result = rowsToNotebook(notebook, sections, cards);
    const { cats, ...rest } = result;
    expect(rest).toEqual(FULL_NB);
    expect(cats).toEqual(derivedTagUnion(FULL_NB));
  });

  it('empty notebook (no sections) round-trips', () => {
    const empty: Notebook = {
      id: 'nb3',
      name: 'Empty',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      sections: [],
    };
    const { notebook, sections, cards } = notebookToRows(empty);
    const { cats, ...rest } = rowsToNotebook(notebook, sections, cards);
    expect(rest).toEqual(empty);
    expect(cats).toEqual([]);
  });

  it('card with no verbs/back/tags round-trips clean', () => {
    const nb: Notebook = {
      id: 'nb4',
      name: 'Minimal Card',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      sections: [
        {
          id: 's4',
          notebookId: 'nb4',
          name: 'S',
          position: 0,
          cards: [
            {
              id: 'c5',
              sectionId: 's4',
              position: 0,
              slots: [{ id: 'sl7', type: 'text', props: { q: 'hi' } }],
            },
          ],
        },
      ],
    };
    const { notebook, sections, cards } = notebookToRows(nb);
    const result = rowsToNotebook(notebook, sections, cards);
    const { cats, ...rest } = result;
    expect(rest).toEqual(nb);
    expect(cats).toEqual([]);
    // verbs/back/tags must not appear on the card
    expect(result.sections[0].cards[0]).not.toHaveProperty('verbs');
    expect(result.sections[0].cards[0]).not.toHaveProperty('back');
    expect(result.sections[0].cards[0]).not.toHaveProperty('tags');
  });
});

describe('service/archive fields round-trip', () => {
  it('persists section services/svcOrder/svcW and card archived through rows', () => {
    const nb: Notebook = {
      id: 'nb5',
      name: 'Services',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      sections: [
        {
          id: 's5',
          notebookId: 'nb5',
          name: 'S',
          position: 0,
          services: { search: true, archive: true, shuffle: true },
          svcOrder: ['shuffle', 'search'],
          svcW: { search: 180, archive: 90 },
          cards: [
            {
              id: 'c6',
              sectionId: 's5',
              position: 0,
              slots: [{ id: 'sl8', type: 'text', props: { q: 'hi' } }],
              archived: true,
            },
          ],
        },
      ],
    };
    const { notebook, sections, cards } = notebookToRows(nb);
    const { cats, ...rest } = rowsToNotebook(notebook, sections, cards);
    expect(rest).toEqual(nb);
    expect(cats).toEqual(derivedTagUnion(nb));
  });

  it('omits absent fields', () => {
    const nb: Notebook = {
      id: 'nb6',
      name: 'Bare',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      sections: [
        {
          id: 's6',
          notebookId: 'nb6',
          name: 'S',
          position: 0,
          cards: [{ id: 'c7', sectionId: 's6', position: 0, slots: [] }],
        },
      ],
    };
    const { notebook, sections, cards } = notebookToRows(nb);
    const result = rowsToNotebook(notebook, sections, cards);
    expect(result.sections[0]).not.toHaveProperty('services');
    expect(result.sections[0]).not.toHaveProperty('svcOrder');
    expect(result.sections[0]).not.toHaveProperty('svcW');
    expect(result.sections[0].cards[0]).not.toHaveProperty('archived');
  });
});

describe('cats rides the notebook data blob (D26 — no SQL migration)', () => {
  const bare = (over: Partial<Notebook> = {}): Notebook => ({
    id: 'nb1',
    name: 'NB',
    createdAt: 'c',
    updatedAt: 'u',
    sections: [],
    ...over,
  });

  it('round-trips cats through the data column', () => {
    const rows = notebookToRows(bare({ cats: ['b', 'a'] }));
    expect(JSON.parse(rows.notebook.data).cats).toEqual(['b', 'a']);
    const back = rowsToNotebook(rows.notebook, rows.sections, rows.cards);
    expect(back.cats).toEqual(['b', 'a']);
  });

  it('a pre-D26 blob (no cats) derives cats from card tags, first-seen', () => {
    const nb = bare({
      sections: [
        {
          id: 's1',
          notebookId: 'nb1',
          name: 'S',
          position: 0,
          cards: [
            { id: 'c1', sectionId: 's1', position: 0, slots: [], tags: ['x', 'y'] },
            { id: 'c2', sectionId: 's1', position: 1, slots: [], tags: ['z', 'x'] },
          ],
        },
      ],
    });
    const rows = notebookToRows(nb);
    expect(JSON.parse(rows.notebook.data).cats).toBeUndefined();
    const back = rowsToNotebook(rows.notebook, rows.sections, rows.cards);
    expect(back.cats).toEqual(['x', 'y', 'z']);
  });
});