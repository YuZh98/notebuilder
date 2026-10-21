import { describe, it, expect } from 'vitest';
import { importNotebook, type NotebookJSON } from './json-io';
import { notebookToRows, rowsToNotebook } from './db-map';
import type { Notebook } from './types';

// JSON.parse accepts lone UTF-16 surrogates ("\ud83e"), but SQLite (via json_extract) and the
// Tauri IPC both need well-formed text: a lone surrogate there becomes invalid UTF-8 or a failed
// call, after which every save of that notebook fails. The import boundary replaces them with U+FFFD.
const hasLoneSurrogate = (s: string): boolean =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

const text = String.raw`{
  "version": 2,
  "notebook": {
    "name": "Name \ud83e",
    "subtitle": "sub \udd14",
    "cats": ["cat \ud83e"],
    "sections": [{
      "name": "Section \ud83e",
      "title": "T \ud800",
      "cards": [{
        "tags": ["cat \ud83e"],
        "slots": [{ "type": "text", "props": { "text": "body \ud83e and a pair 🧠" } }],
        "back": [{ "type": "text", "props": { "text": "back \udfff" } }]
      }]
    }]
  }
}`;

describe('importNotebook — lone surrogates', () => {
  it('replaces every lone surrogate with U+FFFD and keeps real pairs', () => {
    const json = JSON.parse(text) as NotebookJSON;
    const nb = importNotebook(json);
    expect(nb.name).toBe('Name �');
    expect(nb.subtitle).toBe('sub �');
    expect(nb.cats).toEqual(['cat �']);
    expect(nb.sections[0].name).toBe('Section �');
    expect(nb.sections[0].title).toBe('T �');
    expect(nb.sections[0].cards[0].tags).toEqual(['cat �']);
    expect(nb.sections[0].cards[0].slots[0].props.text).toBe('body � and a pair 🧠');
    expect(nb.sections[0].cards[0].back![0].props.text).toBe('back �');
    expect(hasLoneSurrogate(JSON.stringify(nb))).toBe(false);
  });

  it('does not mutate the JSON it was given', () => {
    const json = JSON.parse(text) as NotebookJSON;
    importNotebook(json);
    expect(json.notebook.name).toBe('Name \uD83E');
  });
});

// Names and ids are bound by db.ts, which makes every string argument well-formed (db-sql.test.ts).
describe('notebookToRows — the JSON blobs are written well-formed', () => {
  const nb: Notebook = {
    id: 'nb_x',
    name: 'Book \uD83E',
    subtitle: 'sub \uD83E',
    createdAt: 'c',
    updatedAt: 'u',
    cats: [],
    sections: [
      {
        id: 's1',
        notebookId: 'nb_x',
        name: 'Sec \uDD14',
        title: 'T \uD800',
        position: 0,
        cards: [{ id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'x', type: 'text', props: { text: 'body \uD83E 🧠' } }] }],
      },
    ],
  };

  it('replaces lone surrogates inside the notebook, section and card data', () => {
    const rows = notebookToRows(nb);
    expect(JSON.parse(rows.notebook.data).subtitle).toBe('sub �');
    expect(JSON.parse(rows.sections[0].data).title).toBe('T �');
    expect(JSON.parse(rows.cards[0].data).slots[0].props.text).toBe('body � 🧠');
  });

  it('does not mutate the notebook', () => {
    notebookToRows(nb);
    expect(nb.name).toBe('Book \uD83E');
  });

  it('loads a row whose name column came back null as an empty name', () => {
    const rows = notebookToRows(nb);
    const back = rowsToNotebook(
      { ...rows.notebook, name: null as unknown as string },
      [{ ...rows.sections[0], name: null as unknown as string }],
      [],
    );
    expect(back.name).toBe('');
    expect(back.sections[0].name).toBe('');
  });
});
