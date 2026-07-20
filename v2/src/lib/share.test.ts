import { describe, it, expect } from 'vitest';
import { buildShareHtml } from './share';
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
