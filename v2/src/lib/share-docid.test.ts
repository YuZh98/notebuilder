import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildShareHtml, shareDocId, shareNotebookToFile } from './share';
import { extractNotebook, type ReaderPayload } from './html-io';
import { readerDocRef } from './reader-store';
import { demoNotebook } from './demo';
import type { Notebook } from './types';

// Students' saved progress is namespaced by the payload docId. Every install's first notebook is
// the demo with the fixed id 'nb_demo', and Chrome gives every file:// page ONE localStorage —
// so a bare notebook id let two teachers' files share (and reset) one student's progress.

function payloadOf(html: string): { p: ReaderPayload; raw: string } {
  const raw = extractNotebook(html);
  if (!raw) throw new Error('no payload');
  return { p: JSON.parse(raw) as ReaderPayload, raw };
}

const INSTALL_A = '0b9c1c6e-6f1e-4b7e-9a51-1f0d6f2a9c11';
const INSTALL_B = 'f3a2e1d0-1111-4222-8333-944455556666';

function edited(nb: Notebook, text: string): Notebook {
  const copy = structuredClone(nb);
  copy.sections[0].cards[0].slots[0].props = { text };
  return copy;
}

describe('shareDocId', () => {
  it('combines the install id and the notebook id', () => {
    expect(shareDocId(INSTALL_A, 'nb_demo')).toBe(`${INSTALL_A}:nb_demo`);
  });

  it('two installs sharing their demo notebook (both "nb_demo") get different docIds', () => {
    const a = demoNotebook();
    const b = demoNotebook();
    expect(a.id).toBe('nb_demo');
    expect(b.id).toBe('nb_demo');
    const pa = payloadOf(buildShareHtml(a, undefined, shareDocId(INSTALL_A, a.id))).p;
    const pb = payloadOf(buildShareHtml(b, undefined, shareDocId(INSTALL_B, b.id))).p;
    expect(pa.docId).not.toBe(pb.docId);
  });

  it('the same install re-sharing the same (edited) notebook keeps one docId, so progress carries over', () => {
    const nb = demoNotebook();
    const first = payloadOf(buildShareHtml(nb, 'noir', shareDocId(INSTALL_A, nb.id))).p;
    const again = payloadOf(buildShareHtml(edited(nb, 'fixed a typo'), undefined, shareDocId(INSTALL_A, nb.id))).p;
    expect(first.docId).toBe(again.docId);
  });

  it('different notebooks on one install get different docIds', () => {
    expect(shareDocId(INSTALL_A, 'nb_1')).not.toBe(shareDocId(INSTALL_A, 'nb_2'));
  });

  it('the Reader accepts it as the document identity (non-empty, at most 200 chars)', () => {
    const nb = demoNotebook();
    const { p, raw } = payloadOf(buildShareHtml(nb, undefined, shareDocId(INSTALL_A, nb.id)));
    expect(readerDocRef(p.docId, raw)).toBe(`${INSTALL_A}:nb_demo`);
  });
});

describe('buildShareHtml docId', () => {
  it('falls back to the notebook id when no docId is given', () => {
    expect(payloadOf(buildShareHtml(demoNotebook())).p.docId).toBe('nb_demo');
  });

  it('keeps the docId in the envelope only, never in the interchange JSON', () => {
    const { p } = payloadOf(buildShareHtml(demoNotebook(), undefined, shareDocId(INSTALL_A, 'nb_demo')));
    expect(JSON.stringify(p.notebook)).not.toContain(INSTALL_A);
    expect(Object.keys(p).sort()).toEqual(['docId', 'notebook', 'shared']);
  });
});

describe('shareNotebookToFile docId (browser download)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('writes the given docId into the downloaded file', async () => {
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
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const res = await shareNotebookToFile(demoNotebook(), undefined, shareDocId(INSTALL_A, 'nb_demo'));

    expect(res).toEqual({ path: 'My First Notebook.html' });
    expect(payloadOf(parts[0][0] as string).p.docId).toBe(`${INSTALL_A}:nb_demo`);
  });
});
