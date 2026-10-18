import { describe, it, expect, beforeEach } from 'vitest';
import { readBoot, renderBootError, ReaderBootError, BOOT_ERROR_TITLE } from './reader-boot';
import { injectNotebook } from './html-io';
import { exportNotebook } from './json-io';
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
        cards: [{ id: 'c1', sectionId: 's1', position: 0, slots: [{ id: 'x', type: 'text', props: { text: 'hi' } }] }],
      },
    ],
  };
}

/** Load a document body as the shared file would carry it, with `raw` as the payload text. */
function withPayload(raw: string | null) {
  document.title = 'NoteBuilder — Reader';
  document.body.innerHTML = raw === null ? '<div id="app"></div>' : injectNotebook(SHELL, raw);
}

function bootError(): ReaderBootError {
  try {
    readBoot(document);
  } catch (e) {
    expect(e).toBeInstanceOf(ReaderBootError);
    return e as ReaderBootError;
  }
  throw new Error('readBoot did not throw');
}

beforeEach(() => {
  localStorage.clear();
});

describe('readBoot — a good payload', () => {
  it('returns the Reader props for a valid shared payload', () => {
    withPayload(JSON.stringify({ shared: true, docId: 'nb_author', theme: 'plain', notebook: exportNotebook(nb()) }));
    const boot = readBoot(document);
    expect(boot.notebook.name).toBe('Shared Deck');
    expect(boot.shared).toBe(true);
    expect(boot.docId).toBe('nb_author');
    expect(boot.initialTheme).toBe('plain');
    expect(boot.storageKey).toContain('nb_author');
    expect(boot.initialState?.available).toBe(true);
  });

  it('keeps no progress for an unlocked (shared: false) payload', () => {
    withPayload(JSON.stringify({ shared: false, notebook: exportNotebook(nb()) }));
    const boot = readBoot(document);
    expect(boot.shared).toBe(false);
    expect(boot.storageKey).toBeUndefined();
    expect(boot.initialState).toBeUndefined();
  });
});

describe('readBoot — every failure is a ReaderBootError with readable details', () => {
  it('no embedded payload', () => {
    withPayload(null);
    expect(bootError().reason).toMatch(/no notebook/i);
  });

  it('payload text that is not JSON', () => {
    withPayload('{"shared":true,"notebook":');
    const e = bootError();
    expect(e.reason).toMatch(/damaged/i);
    expect(e.details.length).toBe(1);
  });

  it('payload JSON that is not an object', () => {
    withPayload('null');
    expect(bootError().reason).toMatch(/damaged/i);
  });

  it('a notebook that fails validation lists the validator messages', () => {
    const bad = exportNotebook(nb()) as unknown as { notebook: { sections: unknown[] } };
    bad.notebook.sections = [{ name: 7 }, { cards: 'nope' }];
    withPayload(JSON.stringify({ shared: true, notebook: bad }));
    const e = bootError();
    expect(e.reason).toMatch(/problem/i);
    expect(e.details.length).toBeGreaterThan(1);
    expect(e.details.join('\n')).toMatch(/sections\[0\]/);
  });

  it('a notebook from a newer NoteBuilder (import throws) is reported too', () => {
    const newer = { ...exportNotebook(nb()), version: 999 };
    withPayload(JSON.stringify({ shared: true, notebook: newer }));
    const e = bootError();
    expect(e.details.join('\n')).toMatch(/version/i);
  });
});

describe('renderBootError — a readable page instead of a blank one', () => {
  it('shows the title, the reason, the first few details and what to do next', () => {
    withPayload(null);
    const details = Array.from({ length: 9 }, (_, i) => `problem ${i + 1}`);
    renderBootError(document, new ReaderBootError('The notebook in this file has problems:', details));

    const page = document.querySelector('[data-boot-error]') as HTMLElement;
    expect(page).not.toBeNull();
    expect(page.getAttribute('role')).toBe('alert');
    expect(page.querySelector('h1')?.textContent).toBe(BOOT_ERROR_TITLE);
    expect(BOOT_ERROR_TITLE).toBe("This notebook file can't be opened");
    expect(page.textContent).toContain('The notebook in this file has problems:');
    const items = [...page.querySelectorAll('li')].map((li) => li.textContent);
    expect(items.slice(0, 5)).toEqual(['problem 1', 'problem 2', 'problem 3', 'problem 4', 'problem 5']);
    expect(items[5]).toMatch(/4 more/);
    expect(items).toHaveLength(6);
    expect(page.textContent).toContain('Ask the author to re-share it');
    expect(document.title).toMatch(/can't/i);
  });

  it('replaces whatever was in #app (no half-mounted Reader underneath)', () => {
    withPayload(null);
    document.getElementById('app')!.innerHTML = '<div id="top">half</div>';
    renderBootError(document, new ReaderBootError('No notebook is embedded in this file.'));
    expect(document.getElementById('top')).toBeNull();
    expect(document.getElementById('app')!.querySelector('[data-boot-error]')).not.toBeNull();
  });

  it('falls back to the body when there is no #app', () => {
    document.body.innerHTML = '';
    renderBootError(document, new ReaderBootError('No notebook is embedded in this file.'));
    expect(document.body.querySelector('[data-boot-error]')).not.toBeNull();
  });

  it('renders payload text as text, never as markup', () => {
    withPayload(null);
    const hostile = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
    renderBootError(document, new ReaderBootError('The notebook in this file has problems:', [hostile]));
    const page = document.querySelector('[data-boot-error]') as HTMLElement;
    expect(page.querySelector('img')).toBeNull();
    expect(page.querySelector('b')).toBeNull();
    expect(page.textContent).toContain(hostile);
  });

  it('explains an unexpected (non-ReaderBootError) failure too', () => {
    withPayload(null);
    renderBootError(document, new TypeError('x is undefined'));
    const page = document.querySelector('[data-boot-error]') as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toBe(BOOT_ERROR_TITLE);
    expect(page.textContent).toContain('x is undefined');
  });
});
