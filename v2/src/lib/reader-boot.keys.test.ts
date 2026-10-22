/**
 * A Reader boot maps progress through the card keys exactly once. computeKeys exports the whole
 * notebook and hashes every card; readBoot's synchronous load and the Reader's progress store both
 * need the same keys, so the store must reuse the load's instead of recomputing them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';

// computeKeys is the only exportNotebook caller on the boot path, so counting exports counts it.
vi.mock('./json-io', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./json-io')>();
  return { ...actual, exportNotebook: vi.fn(actual.exportNotebook) };
});

import Reader from './components/Reader.svelte';
import { readBoot } from './reader-boot';
import { injectNotebook } from './html-io';
import { exportNotebook } from './json-io';
import { mode } from './stores/mode';
import { readerStorageKey } from './reader-store';
import type { Notebook } from './types';

const SHELL =
  '<div id="app"></div><script type="application/notebuilder+json" id="notebook-source"></script>';

function nb(): Notebook {
  return {
    id: 'nb_author',
    name: 'Shared Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 's1',
        notebookId: 'nb_author',
        name: 'One',
        position: 0,
        cards: [
          {
            id: 'c1',
            sectionId: 's1',
            position: 0,
            slots: [{ id: 'q', type: 'choice', props: { q: 'pick', options: ['a', 'b'], answer: [0] } }],
          },
        ],
      },
    ],
  };
}

const exports = () => vi.mocked(exportNotebook).mock.calls.length;

/** The shared file as reader-main sees it, then the Reader mounted from readBoot's props. */
async function bootAndMount(): Promise<number> {
  document.body.innerHTML = injectNotebook(
    SHELL,
    JSON.stringify({ shared: true, docId: 'nb_author', notebook: exportNotebook(nb()) }),
  );
  vi.mocked(exportNotebook).mockClear();
  render(Reader, { props: readBoot(document) });
  await tick();
  return exports();
}

beforeEach(() => {
  localStorage.clear();
  mode.set('edit');
});

describe('Reader boot — card keys are computed once', () => {
  it('when stored progress has to be mapped back onto the cards', async () => {
    localStorage.setItem(
      readerStorageKey('nb_author'),
      JSON.stringify({ v: 1, savedAt: 1, cards: {}, notes: {} }),
    );
    expect(await bootAndMount()).toBe(1);
  });

  it('when nothing is stored yet', async () => {
    expect(await bootAndMount()).toBe(1);
  });
});
