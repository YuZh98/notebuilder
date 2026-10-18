/**
 * Card.draft is LOCAL authoring state (like Section.folded): it persists in SQLite so a review
 * can span sessions, but it never leaves the author's machine — not in a JSON export, not in a
 * shared Reader file — and an incoming file can never set it.
 */
import { describe, it, expect } from 'vitest';
import { exportNotebook, importNotebook, validateNotebook, type NotebookJSON } from './json-io';
import { buildShareHtml } from './share';
import { extractNotebook } from './html-io';
import { notebookToRows, rowsToNotebook } from './db-map';
import type { Notebook } from './types';

function drafted(): Notebook {
  return {
    id: 'nb_d',
    name: 'From AI',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'sec_1',
        notebookId: 'nb_d',
        name: 'Basics',
        position: 0,
        cards: [
          { id: 'c1', sectionId: 'sec_1', position: 0, draft: true, slots: [{ id: 's1', type: 'text', props: { text: 'one' } }] },
          { id: 'c2', sectionId: 'sec_1', position: 1, slots: [{ id: 's2', type: 'text', props: { text: 'two' } }] },
        ],
      },
    ],
  };
}

describe('Card.draft never leaves the machine', () => {
  it('exportNotebook never emits draft', () => {
    const json = exportNotebook(drafted());
    expect(json.notebook.sections[0].cards[0]).not.toHaveProperty('draft');
    expect(JSON.stringify(json)).not.toContain('draft');
  });

  it('the shared Reader payload never contains draft', () => {
    const raw = extractNotebook(buildShareHtml(drafted(), 'plain'));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('draft');
  });

  it('importNotebook never sets draft, even when the file carries the key', () => {
    const json = exportNotebook(drafted());
    (json.notebook.sections[0].cards[0] as Record<string, unknown>).draft = true;
    expect(validateNotebook(json).errors).toEqual([]);
    const nb = importNotebook(json as NotebookJSON);
    for (const c of nb.sections.flatMap((s) => s.cards)) expect(c).not.toHaveProperty('draft');
  });
});

describe('Card.draft persists locally (SQLite card blob)', () => {
  it('rides the card data column and survives a reload', () => {
    const rows = notebookToRows(drafted());
    expect(JSON.parse(rows.cards[0].data).draft).toBe(true);
    const back = rowsToNotebook(rows.notebook, rows.sections, rows.cards);
    expect(back.sections[0].cards[0].draft).toBe(true);
  });

  it('is absent from the blob (and the loaded card) when the card is not a draft', () => {
    const rows = notebookToRows(drafted());
    expect(JSON.parse(rows.cards[1].data)).not.toHaveProperty('draft');
    const back = rowsToNotebook(rows.notebook, rows.sections, rows.cards);
    expect(back.sections[0].cards[1]).not.toHaveProperty('draft');
  });
});
