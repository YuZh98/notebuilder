import { describe, it, expect } from 'vitest';
import { exportNotebook, importNotebook, validateNotebookJSON } from './json-io';
import type { Notebook } from './types';

const sampleNotebook: Notebook = {
  id: 'nb_1',
  name: 'Test Notebook',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sections: [
    {
      id: 'sec_1',
      notebookId: 'nb_1',
      name: 'Section One',
      position: 0,
      cards: [
        {
          id: 'card_1',
          sectionId: 'sec_1',
          position: 0,
          slots: [
            { id: 'slot_1', type: 'text', props: { text: 'Hello **world**' } },
          ],
        },
      ],
    },
  ],
};

describe('exportNotebook', () => {
  it('exports with version and structure', () => {
    const json = exportNotebook(sampleNotebook);
    expect(json.version).toBe(1);
    expect(json.notebook.name).toBe('Test Notebook');
    expect(json.notebook.sections).toHaveLength(1);
    expect(json.notebook.sections[0].cards).toHaveLength(1);
    expect(json.notebook.sections[0].cards[0].slots[0].type).toBe('text');
    expect(json.notebook.sections[0].cards[0].slots[0].props).toEqual({ text: 'Hello **world**' });
  });

  it('does not include internal ids in export', () => {
    const json = exportNotebook(sampleNotebook);
    const slot = json.notebook.sections[0].cards[0].slots[0];
    expect(slot).not.toHaveProperty('id');
  });
});

describe('importNotebook', () => {
  it('roundtrips through export/import', () => {
    const json = exportNotebook(sampleNotebook);
    const imported = importNotebook(json);
    expect(imported.name).toBe('Test Notebook');
    expect(imported.sections).toHaveLength(1);
    expect(imported.sections[0].name).toBe('Section One');
    expect(imported.sections[0].cards[0].slots[0].type).toBe('text');
    expect(imported.sections[0].cards[0].slots[0].props).toEqual({ text: 'Hello **world**' });
  });

  it('generates unique IDs on import', () => {
    const json = exportNotebook(sampleNotebook);
    const a = importNotebook(json);
    const b = importNotebook(json);
    expect(a.id).not.toBe(b.id);
    expect(a.sections[0].id).not.toBe(b.sections[0].id);
  });

  it('throws on unsupported version', () => {
    const json = exportNotebook(sampleNotebook);
    json.version = 99;
    expect(() => importNotebook(json)).toThrow('Unsupported schema version: 99');
  });

  it('rejects an unknown slot type, naming the type', () => {
    const json = exportNotebook(sampleNotebook);
    json.notebook.sections[0].cards[0].slots[0].type = 'mystery';
    expect(() => importNotebook(json)).toThrow(/mystery/);
  });

  it('reports a text slot whose props fail its validate()', () => {
    const json = exportNotebook(sampleNotebook);
    json.notebook.sections[0].cards[0].slots[0].props = { text: 42 };
    expect(() => importNotebook(json)).toThrow(/text must be a string/);
  });

  it('round-trips slot layout fields (w/fuse/fuseW)', () => {
    const nb: Notebook = structuredClone(sampleNotebook);
    nb.sections[0].cards[0].slots[0].w = 6;
    nb.sections[0].cards[0].slots[0].fuse = true;
    nb.sections[0].cards[0].slots[0].fuseW = 3;
    const imported = importNotebook(exportNotebook(nb));
    const slot = imported.sections[0].cards[0].slots[0];
    expect(slot.w).toBe(6);
    expect(slot.fuse).toBe(true);
    expect(slot.fuseW).toBe(3);
  });
});

describe('validateNotebookJSON', () => {
  it('passes for valid JSON', () => {
    const json = exportNotebook(sampleNotebook);
    expect(validateNotebookJSON(json)).toEqual([]);
  });

  it('fails for null', () => {
    expect(validateNotebookJSON(null)).toContain('JSON must be an object');
  });

  it('fails for missing version', () => {
    const errors = validateNotebookJSON({ notebook: { name: 'x', sections: [] } });
    expect(errors).toContain('Missing or invalid "version" field');
  });

  it('fails for missing notebook', () => {
    const errors = validateNotebookJSON({ version: 1 });
    expect(errors).toContain('Missing "notebook" field');
  });

  it('fails for a slot missing its type', () => {
    const json = exportNotebook(sampleNotebook) as unknown as {
      notebook: { sections: { cards: { slots: { type?: string }[] }[] }[] };
    };
    delete json.notebook.sections[0].cards[0].slots[0].type;
    const errors = validateNotebookJSON(json);
    expect(errors.some((e) => /type/.test(e))).toBe(true);
  });

  it('flags an unknown slot type', () => {
    const json = exportNotebook(sampleNotebook);
    json.notebook.sections[0].cards[0].slots[0].type = 'mystery';
    const errors = validateNotebookJSON(json);
    expect(errors.some((e) => /mystery/.test(e))).toBe(true);
  });

  it('fails when a card.slots is not an array', () => {
    const json = exportNotebook(sampleNotebook) as unknown as {
      notebook: { sections: { cards: { slots: unknown }[] }[] };
    };
    json.notebook.sections[0].cards[0].slots = 'oops';
    const errors = validateNotebookJSON(json);
    expect(errors.some((e) => /slots/.test(e))).toBe(true);
  });
});
