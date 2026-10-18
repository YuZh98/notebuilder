import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Card, Notebook, Slot } from './lib/types';

// The Reader validates a shared file before showing anything, and Import validates a JSON
// backup. A problem slot the Study view still tolerates (a parameter named "e", step 0, an
// unfinished answer) would reach every student as a blank page, or come back as a backup that
// can't be re-imported. Share and Export now validate first and list what to fix instead.
const share = vi.hoisted(() => ({
  next: null as unknown,
  shared: [] as { nb: Notebook; theme?: string; docId?: string }[],
  exported: [] as Notebook[],
}));
vi.mock('./lib/share', async (orig) => ({
  ...(await orig<typeof import('./lib/share')>()),
  importNotebookFromFile: vi.fn(async () => share.next),
  shareNotebookToFile: vi.fn(async (nb: Notebook, theme?: string, docId?: string) => {
    share.shared.push({ nb, theme, docId });
    return { path: `${nb.name}.html` };
  }),
  exportNotebookToFile: vi.fn(async (nb: Notebook) => {
    share.exported.push(nb);
    return { path: `${nb.name}.json` };
  }),
}));

import App from './App.svelte';
import { mode } from './lib/stores/mode';

const GOOD = { prompt: 'What is {{a}} + 1?', params: [{ name: 'a', min: 1, max: 5, step: 1 }], answer: 'a + 1' };

function nbWith(slots: Omit<Slot, 'id'>[], card: Partial<Card> = {}): Notebook {
  return {
    id: 'nb_guard',
    name: 'Guarded',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    cats: [],
    sections: [
      {
        id: 's_intro',
        notebookId: 'nb_guard',
        name: 'Intro',
        position: 0,
        cards: [{ id: 'c_ok', sectionId: 's_intro', position: 0, slots: [{ id: 't1', type: 'text', props: { text: 'hi' } }] }],
      },
      {
        id: 's_alg',
        notebookId: 'nb_guard',
        name: 'Algebra',
        position: 1,
        cards: [
          { id: 'c_ok2', sectionId: 's_alg', position: 0, slots: [{ id: 't2', type: 'text', props: { text: 'warm-up' } }] },
          { id: 'c_x', sectionId: 's_alg', position: 1, slots: slots.map((s, i) => ({ id: `x${i}`, ...s })), ...card },
        ],
      },
    ],
  };
}

const problem = (props: Record<string, unknown>) => ({ type: 'problem', props: { ...GOOD, ...props } });

async function open(container: HTMLElement, nb: Notebook) {
  share.next = { notebook: nb, warnings: [] };
  await fireEvent.click(container.querySelector('button[title="Import a notebook JSON"]')!);
  await waitFor(() => expect(container.textContent).toContain('warm-up'));
  await tick();
}

const shareBtn = (c: HTMLElement) => c.querySelector('.share-btn')!;
const exportBtn = (c: HTMLElement) => c.querySelector('button[title="Backup as JSON (data only)"]')!;
const report = () => document.querySelector('.import-report');

let confirmSpy = vi.fn();
beforeEach(() => {
  confirmSpy = vi.fn(() => true);
  vi.spyOn(window, 'confirm').mockImplementation(confirmSpy);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  share.next = null;
  share.shared = [];
  share.exported = [];
  mode.set('edit');
});

describe('App — Share is held back while the notebook fails validation', () => {
  it.each([
    ['a parameter named "e"', { params: [{ name: 'e', min: 1, max: 5, step: 1 }], prompt: 'What is {{e}}?', answer: 'e + 1' }, /"e" is reserved/],
    ['a parameter named "min"', { params: [{ name: 'min', min: 1, max: 5, step: 1 }], prompt: 'Hi', answer: 'min + 1' }, /"min" is reserved/],
    ['step 0', { params: [{ name: 'a', min: 1, max: 5, step: 0 }] }, /step must be greater than 0/],
    ['an unfinished answer "a*"', { answer: 'a*' }, /answer:/],
  ])('%s: lists the problem with its path in ImportReport and writes no file', async (_, props, what) => {
    const { container } = render(App);
    await open(container, nbWith([problem(props)]));
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(report()).toBeTruthy());
    expect(report()!.querySelector('.ir-title')!.textContent).toMatch(/before sharing/);
    const item = report()!.querySelector('.ir-list.error .ir-item')!;
    expect(item.textContent).toMatch(what);
    expect(item.querySelector('.ir-where')!.textContent).toBe('section 2 › card 2 › slot 1 › props');
    expect(share.shared).toEqual([]);
  });

  it('the report counts the problems and closes; nothing is shared', async () => {
    const { container } = render(App);
    await open(container, nbWith([problem({ answer: 'a*' }), problem({ params: [{ name: 'a', min: 1, max: 5, step: 0 }] })]));
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(report()).toBeTruthy());
    expect(report()!.querySelector('.ir-title')!.textContent).toBe('Fix these 2 problems before sharing');
    // The problems are in the open notebook, not in anything an AI wrote: no AI fix request.
    expect(report()!.querySelector('[data-act="copy-fix"]')).toBeNull();
    await fireEvent.click([...report()!.querySelectorAll('button')].find((b) => b.textContent === 'Close')!);
    await waitFor(() => expect(report()).toBeNull());
    expect(share.shared).toEqual([]);
  });

  it('validation runs before the drafts confirmation: an invalid draft notebook asks nothing', async () => {
    const { container } = render(App);
    await open(container, nbWith([problem({ answer: 'a*' })], { draft: true }));
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(report()).toBeTruthy());
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(share.shared).toEqual([]);
  });

  it('a valid notebook with drafts still asks about the drafts, then shares', async () => {
    const { container } = render(App);
    await open(container, nbWith([problem({})], { draft: true }));
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(share.shared).toHaveLength(1));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(report()).toBeNull();
  });

  it('warnings do not block: a formula reading a variable from another card still shares', async () => {
    const { container } = render(App);
    await open(container, nbWith([problem({}), { type: 'compute', props: { expr: 'zz * 2', out: 'y' } }]));
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(share.shared).toHaveLength(1));
    expect(report()).toBeNull();
    expect(share.shared[0].nb.id).toBe('nb_guard');
  });

  it('browser build: the docId is a per-session install id plus the notebook id, the same on a re-share', async () => {
    const { container } = render(App);
    await open(container, nbWith([problem({})]));
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(share.shared).toHaveLength(1));
    await fireEvent.click(shareBtn(container));
    await waitFor(() => expect(share.shared).toHaveLength(2));
    expect(share.shared[0].docId).toMatch(/^[\w-]{8,64}:nb_guard$/);
    expect(share.shared[1].docId).toBe(share.shared[0].docId);
  });
});

describe('App — Export is held back while the notebook fails validation', () => {
  it('lists the problem and writes no backup that could not be re-imported', async () => {
    const { container } = render(App);
    await open(container, nbWith([problem({ params: [{ name: 'e', min: 1, max: 5, step: 1 }], answer: 'e' })]));
    await fireEvent.click(exportBtn(container));
    await waitFor(() => expect(report()).toBeTruthy());
    expect(report()!.querySelector('.ir-title')!.textContent).toBe('Fix this problem before exporting');
    expect(report()!.textContent).toMatch(/"e" is reserved/);
    expect(share.exported).toEqual([]);
  });

  it('a valid notebook exports as before (warnings do not block)', async () => {
    const { container } = render(App);
    await open(container, nbWith([problem({}), { type: 'compute', props: { expr: 'zz * 2', out: 'y' } }]));
    await fireEvent.click(exportBtn(container));
    await waitFor(() => expect(share.exported).toHaveLength(1));
    expect(report()).toBeNull();
  });
});

describe('App — an import problem report keeps its AI fix request', () => {
  it('still offers "Copy fix request for your AI" for a file that failed to import', async () => {
    const { checkNotebookText } = await import('./lib/import-hints');
    const text = JSON.stringify({ version: 2, notebook: { name: 'X', sections: [{ name: 'S', cards: [{ slots: [{ type: 'quizz', props: {} }] }] }] } });
    share.next = { error: 'Invalid notebook file', report: checkNotebookText(text) };
    const { container } = render(App);
    await fireEvent.click(container.querySelector('button[title="Import a notebook JSON"]')!);
    await waitFor(() => expect(report()).toBeTruthy());
    expect(report()!.querySelector('[data-act="copy-fix"]')).toBeTruthy();
    expect(report()!.querySelector('.ir-title')!.textContent).toMatch(/can't be imported/);
  });
});
