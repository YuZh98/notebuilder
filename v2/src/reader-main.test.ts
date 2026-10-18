// The Reader entry module boots on import. A broken payload must leave a readable page, never a
// thrown error before mount (which shows every student a blank file).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { injectNotebook } from './lib/html-io';
import { exportNotebook } from './lib/json-io';
import { BOOT_ERROR_TITLE } from './lib/reader-boot';
import type { Notebook } from './lib/types';

const SHELL =
  '<div id="app"></div><script type="application/notebuilder+json" id="notebook-source"></script>';

function nb(): Notebook {
  return {
    id: 'nb_author',
    name: 'Boot Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 's1',
        notebookId: 'nb_author',
        name: 'One',
        position: 0,
        cards: [{ id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'x', type: 'text', props: { text: 'hello student' } }] }],
      },
    ],
  };
}

let mounted: Record<string, unknown> | undefined;
let unmountFresh: ((c: Record<string, unknown>) => unknown) | undefined;

async function bootWith(payload: string) {
  document.body.innerHTML = injectNotebook(SHELL, payload);
  vi.resetModules();
  const mod = await import('./reader-main');
  mounted = mod.default as Record<string, unknown> | undefined;
  // The entry mounted with the svelte instance of this fresh module registry; unmount with it too.
  unmountFresh = (await import('svelte')).unmount;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (mounted) unmountFresh?.(mounted);
  mounted = undefined;
  vi.restoreAllMocks();
  document.body.className = '';
  delete document.body.dataset.theme;
});

describe('reader-main boot', () => {
  it('mounts the Reader for a valid payload', async () => {
    await bootWith(JSON.stringify({ shared: true, docId: 'nb_author', notebook: exportNotebook(nb()) }));
    expect(mounted).toBeDefined();
    expect(document.querySelector('[data-boot-error]')).toBeNull();
    expect(document.body.textContent).toContain('hello student');
  });

  it('renders the readable error page (not a throw) for an invalid notebook', async () => {
    const bad = exportNotebook(nb()) as unknown as { notebook: { sections: unknown[] } };
    bad.notebook.sections = [{ name: 3 }];
    await expect(bootWith(JSON.stringify({ shared: true, notebook: bad }))).resolves.toBeUndefined();
    expect(mounted).toBeUndefined();
    const page = document.querySelector('[data-boot-error]') as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toBe(BOOT_ERROR_TITLE);
    expect(page.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(page.textContent).toContain('Ask the author to re-share it');
    expect(console.error).toHaveBeenCalled();
  });

  it('renders the error page for a damaged (non-JSON) payload', async () => {
    await bootWith('{"shared":true,');
    expect(document.querySelector('[data-boot-error] h1')?.textContent).toBe(BOOT_ERROR_TITLE);
  });
});
