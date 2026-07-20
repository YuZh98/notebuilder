import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildShareHtml, exportNotebookToFile, importNotebookFromFile } from './share';
import { extractNotebook, type ReaderPayload } from './html-io';
import type { Notebook } from './types';

function sample(text = 'Hello **world**'): Notebook {
  return {
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
          { id: 'card_1', sectionId: 'sec_1', position: 0, slots: [{ id: 'slot_1', type: 'text', props: { text } }] },
        ],
      },
    ],
  };
}

function payloadOf(html: string): ReaderPayload {
  const raw = extractNotebook(html);
  if (!raw) throw new Error('no payload');
  return JSON.parse(raw) as ReaderPayload;
}

describe('buildShareHtml', () => {
  it('produces HTML whose embedded payload parses and round-trips', () => {
    const html = buildShareHtml(sample());
    const p = payloadOf(html);
    expect(p.notebook.notebook.name).toBe('Test Notebook');
    expect(p.notebook.version).toBe(1);
  });

  it('marks the payload shared:true', () => {
    expect(payloadOf(buildShareHtml(sample())).shared).toBe(true);
  });

  it('embeds the theme when given and omits it otherwise', () => {
    expect(payloadOf(buildShareHtml(sample(), 'noir')).theme).toBe('noir');
    expect(payloadOf(buildShareHtml(sample())).theme).toBeUndefined();
  });

  it('never embeds reader progress / readerState keys', () => {
    const raw = extractNotebook(buildShareHtml(sample()))!;
    expect(raw).not.toContain('readerState');
    expect(raw).not.toContain('progress');
  });

  it('keeps a </script> inside card text from closing the payload tag early', () => {
    const html = buildShareHtml(sample('danger </script><script>alert(1)</script>'));
    expect(html).not.toContain('</script><script>alert(1)');
    expect(payloadOf(html).notebook.notebook.sections[0].cards[0].slots[0].props.text).toBe(
      'danger </script><script>alert(1)</script>',
    );
  });
});

// jsdom's Blob/File omit .text(); real browsers implement it. This fake supplies it so the
// browser branch (file.text()) is exercisable, and captures the JSON handed to the download blob.
function fakeFile(content: string, name: string): File {
  return Object.assign(new File([content], name), { text: () => Promise.resolve(content) });
}

// isTauri() is false under jsdom, so both flows take their browser fallback branch here.
describe('exportNotebookToFile — browser fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads the notebook document as a JSON blob and reports the file name', async () => {
    const parts: BlobPart[][] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(p: BlobPart[] = [], o?: BlobPropertyBag) {
          super(p, o);
          parts.push(p);
        }
      },
    );
    // jsdom omits URL.createObjectURL/revokeObjectURL entirely — define harmless stubs.
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const res = await exportNotebookToFile(sample());

    expect(res).toEqual({ path: 'Test Notebook.json' });
    expect(click).toHaveBeenCalledOnce();
    const parsed = JSON.parse(parts[0][0] as string);
    expect(parsed.version).toBe(1);
    expect(parsed.notebook.name).toBe('Test Notebook');
  });
});

describe('importNotebookFromFile — browser fallback', () => {
  it('validates and imports a notebook from a picked JSON file', async () => {
    const json = JSON.stringify({ version: 1, notebook: { name: 'Imported', sections: [] } });
    const res = await importNotebookFromFile(() => Promise.resolve(fakeFile(json, 'deck.json')));
    expect('notebook' in res && res.notebook.name).toBe('Imported');
  });

  it('imports the embedded notebook from a shared .html file', async () => {
    const html = buildShareHtml(sample());
    const res = await importNotebookFromFile(() => Promise.resolve(fakeFile(html, 'shared.html')));
    expect('notebook' in res && res.notebook.name).toBe('Test Notebook');
  });

  it('reports an error for an invalid notebook file', async () => {
    const res = await importNotebookFromFile(() => Promise.resolve(fakeFile('{"nope":true}', 'bad.json')));
    expect('error' in res).toBe(true);
  });

  it('reports cancelled when the picker returns no file', async () => {
    const res = await importNotebookFromFile(() => Promise.resolve(null));
    expect(res).toEqual({ cancelled: true });
  });
});
