import { describe, it, expect } from 'vitest';
import { exportNotebook, importNotebook, validateNotebookJSON, adoptNotebookIdentity } from './json-io';
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

describe('chapter and chrome fields', () => {
  function chromeNotebook(): Notebook {
    const nb: Notebook = structuredClone(sampleNotebook);
    nb.subtitle = 'A course';
    nb.width = 'narrow';
    nb.sections[0].locked = true;
    nb.sections[0].width = 2;
    nb.sections[0].title = 'Chapter Title';
    nb.sections[0].subtitle = 'Chapter subtitle';
    nb.sections[0].folded = true;
    nb.sections[0].cards[0].accent = '#00cc88';
    nb.sections.push({
      id: 'sec_div',
      notebookId: 'nb_1',
      name: 'Part II',
      position: 1,
      cards: [],
      kind: 'divider',
    });
    return nb;
  }

  it('exports section chrome, divider kind, card accent, notebook subtitle/width', () => {
    const json = exportNotebook(chromeNotebook());
    expect(json.notebook.subtitle).toBe('A course');
    expect(json.notebook.width).toBe('narrow');
    const s = json.notebook.sections[0];
    expect(s.locked).toBe(true);
    expect(s.width).toBe(2);
    expect(s.title).toBe('Chapter Title');
    expect(s.subtitle).toBe('Chapter subtitle');
    expect(s.cards[0].accent).toBe('#00cc88');
    expect(json.notebook.sections[1].kind).toBe('divider');
  });

  it('never exports folded (local-only)', () => {
    const json = exportNotebook(chromeNotebook());
    expect(json.notebook.sections[0]).not.toHaveProperty('folded');
    expect(JSON.stringify(json)).not.toContain('folded');
  });

  it('round-trips chrome fields except folded', () => {
    const imported = importNotebook(exportNotebook(chromeNotebook()));
    expect(imported.subtitle).toBe('A course');
    expect(imported.width).toBe('narrow');
    const s = imported.sections[0];
    expect(s.locked).toBe(true);
    expect(s.width).toBe(2);
    expect(s.title).toBe('Chapter Title');
    expect(s.subtitle).toBe('Chapter subtitle');
    expect(s.folded).toBeUndefined();
    expect(s.cards[0].accent).toBe('#00cc88');
    expect(imported.sections[1].kind).toBe('divider');
  });

  it('omits chrome keys entirely when absent', () => {
    const json = exportNotebook(sampleNotebook);
    expect(json.notebook).not.toHaveProperty('subtitle');
    expect(json.notebook).not.toHaveProperty('width');
    const s = json.notebook.sections[0];
    for (const key of ['kind', 'locked', 'width', 'title', 'subtitle']) {
      expect(s).not.toHaveProperty(key);
    }
    expect(s.cards[0]).not.toHaveProperty('accent');
  });

  it('validate rejects a section kind other than divider', () => {
    const json = exportNotebook(chromeNotebook()) as unknown as {
      notebook: { sections: { kind?: string }[] };
    };
    json.notebook.sections[1].kind = 'banner';
    const errors = validateNotebookJSON(json);
    expect(errors.some((e) => /kind/.test(e))).toBe(true);
  });

  it('validate rejects a non-boolean section locked flag', () => {
    const json = exportNotebook(chromeNotebook()) as unknown as {
      notebook: { sections: { locked?: unknown }[] };
    };
    json.notebook.sections[0].locked = 'yes';
    const errors = validateNotebookJSON(json);
    expect(errors.some((e) => /locked must be a boolean/.test(e))).toBe(true);
  });

  it('validate rejects non-positive or non-numeric section width', () => {
    const base = exportNotebook(chromeNotebook());
    for (const bad of [0, -1, Infinity, NaN, 'wide']) {
      const json = structuredClone(base) as unknown as {
        notebook: { sections: { width?: unknown }[] };
      };
      json.notebook.sections[0].width = bad;
      const errors = validateNotebookJSON(json);
      expect(errors.some((e) => /width/.test(e)), `width=${String(bad)}`).toBe(true);
    }
  });

  it('validate rejects non-string title/subtitle/accent', () => {
    const json = exportNotebook(chromeNotebook()) as unknown as {
      notebook: {
        subtitle?: unknown;
        sections: { title?: unknown; subtitle?: unknown; cards: { accent?: unknown }[] }[];
      };
    };
    json.notebook.sections[0].title = 5;
    json.notebook.sections[0].subtitle = false;
    json.notebook.sections[0].cards[0].accent = 7;
    json.notebook.subtitle = 9;
    const errors = validateNotebookJSON(json);
    expect(errors.some((e) => /title/.test(e))).toBe(true);
    expect(errors.some((e) => /subtitle/.test(e))).toBe(true);
    expect(errors.some((e) => /accent/.test(e))).toBe(true);
  });

  it('validate rejects an invalid notebook width', () => {
    const json = exportNotebook(chromeNotebook()) as unknown as { notebook: { width?: unknown } };
    json.notebook.width = 'gigantic';
    const errors = validateNotebookJSON(json);
    expect(errors.some((e) => /width/.test(e))).toBe(true);
  });

  it('validate still passes valid chrome fields (schema version stays 1)', () => {
    const json = exportNotebook(chromeNotebook());
    expect(json.version).toBe(1);
    expect(validateNotebookJSON(json)).toEqual([]);
  });
});

describe('adoptNotebookIdentity', () => {
  it('rebinds notebook id and section notebookId', () => {
    const imported = importNotebook(exportNotebook(sampleNotebook));
    const adopted = adoptNotebookIdentity(imported, 'nb_existing');
    expect(adopted.id).toBe('nb_existing');
    for (const s of adopted.sections) expect(s.notebookId).toBe('nb_existing');
  });

  it('keeps section/card/slot content untouched', () => {
    const imported = importNotebook(exportNotebook(sampleNotebook));
    const adopted = adoptNotebookIdentity(imported, 'nb_existing');
    expect(adopted.name).toBe(imported.name);
    expect(adopted.sections[0].cards[0].slots[0].props).toEqual({ text: 'Hello **world**' });
    expect(adopted.sections[0].cards[0].sectionId).toBe(adopted.sections[0].id);
  });
});

describe('validateNotebookJSON graph checks', () => {
  function nb(slots: unknown[]): unknown {
    return { version: 1, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots }] }] } };
  }

  it('flags a text read with no writer in the card', () => {
    const errors = validateNotebookJSON(nb([{ type: 'text', props: { text: 'value: {{ghost}}' } }]));
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('flags a compute cycle', () => {
    const errors = validateNotebookJSON(
      nb([
        { type: 'compute', props: { expr: 'b + 1', out: 'a' } },
        { type: 'compute', props: { expr: 'a + 1', out: 'b' } },
      ]),
    );
    expect(errors.some((e) => /cycle/i.test(e))).toBe(true);
  });

  it('accepts a healthy slider→compute→text card', () => {
    const errors = validateNotebookJSON(
      nb([
        { type: 'slider', props: { key: 'a', value: 1 } },
        { type: 'compute', props: { expr: 'a * 2', out: 'b' } },
        { type: 'text', props: { text: '{{b}}' } },
      ]),
    );
    expect(errors).toEqual([]);
  });
});

describe('tags round-trip', () => {
  it('exports and re-imports card tags', () => {
    const nb: Notebook = JSON.parse(JSON.stringify(sampleNotebook));
    nb.sections[0].cards[0].tags = ['algebra', 'easy'];
    const imported = importNotebook(exportNotebook(nb));
    expect(imported.sections[0].cards[0].tags).toEqual(['algebra', 'easy']);
  });
});
