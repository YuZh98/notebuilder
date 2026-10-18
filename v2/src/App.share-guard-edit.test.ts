import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Notebook } from './lib/types';

// The original repro, end to end through the editor: the author breaks a valid problem slot in
// ProblemEdit (a parameter renamed to "e", an answer left as "a*"). Study still tolerates it, but
// the Reader and Import would reject the file, so Share and Export are held back until the author
// fixes it in the same editor, after which they go through.
const io = vi.hoisted(() => ({
  next: null as unknown,
  shared: [] as { nb: Notebook; docId?: string }[],
  exported: [] as Notebook[],
}));
vi.mock('./lib/share', async (orig) => ({
  ...(await orig<typeof import('./lib/share')>()),
  importNotebookFromFile: vi.fn(async () => io.next),
  shareNotebookToFile: vi.fn(async (nb: Notebook, _theme?: string, docId?: string) => {
    io.shared.push({ nb, docId });
    return { path: `${nb.name}.html` };
  }),
  exportNotebookToFile: vi.fn(async (nb: Notebook) => {
    io.exported.push(nb);
    return { path: `${nb.name}.json` };
  }),
}));

import App from './App.svelte';
import { mode } from './lib/stores/mode';

const valid = (): Notebook => ({
  id: 'nb_edit',
  name: 'Edited',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  cats: [],
  sections: [
    {
      id: 's1',
      notebookId: 'nb_edit',
      name: 'Algebra',
      position: 0,
      cards: [
        {
          id: 'c1',
          sectionId: 's1',
          position: 0,
          slots: [
            {
              id: 'p1',
              type: 'problem',
              props: { prompt: 'What is {{a}} + 1?', params: [{ name: 'a', min: 1, max: 5, step: 1 }], answer: 'a + 1' },
            },
          ],
        },
      ],
    },
  ],
});

async function openInEditor(container: HTMLElement) {
  io.next = { notebook: valid(), warnings: [] };
  await fireEvent.click(container.querySelector('button[title="Import a notebook JSON"]')!);
  await waitFor(() => expect(container.querySelector('input[aria-label="Parameter 1 name"]')).toBeTruthy());
  await tick();
}

async function type(container: HTMLElement, label: string, value: string) {
  const input = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  input.value = value;
  await fireEvent.input(input);
  await tick();
}

const report = () => document.querySelector('.import-report');
const closeReport = async () => {
  await fireEvent.click([...report()!.querySelectorAll('button')].find((b) => b.textContent === 'Close')!);
  await waitFor(() => expect(report()).toBeNull());
};

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  io.next = null;
  io.shared = [];
  io.exported = [];
  mode.set('edit');
});

describe('App — a slot broken in the editor holds back Share and Export until it is fixed', () => {
  it('Share: a parameter renamed to "e" is listed and nothing is written; renamed back, it shares', async () => {
    const { container } = render(App);
    await openInEditor(container);

    await type(container, 'Parameter 1 name', 'e');
    // The editor itself already says what is wrong, next to the field.
    expect(container.querySelector('.problem-issues')!.textContent).toMatch(/"e" is reserved/);

    await fireEvent.click(container.querySelector('.share-btn')!);
    await waitFor(() => expect(report()).toBeTruthy());
    expect(report()!.querySelector('.ir-title')!.textContent).toBe('Fix this problem before sharing');
    expect(report()!.querySelector('.ir-list.error')!.textContent).toMatch(/parameter "e": "e" is reserved/);
    expect(io.shared).toEqual([]);
    await closeReport();

    await type(container, 'Parameter 1 name', 'a');
    await fireEvent.click(container.querySelector('.share-btn')!);
    await waitFor(() => expect(io.shared).toHaveLength(1));
    expect(report()).toBeNull();
    // What is written is the fixed notebook, under this install's docId for it.
    const props = io.shared[0].nb.sections[0].cards[0].slots[0].props as { params: { name: string }[] };
    expect(props.params[0].name).toBe('a');
    expect(io.shared[0].docId).toMatch(/^[\w-]{8,64}:nb_edit$/);
  });

  it('Export: an unfinished answer "a*" is listed and no backup is written; completed, it exports', async () => {
    const { container } = render(App);
    await openInEditor(container);

    await type(container, 'Answer formula', 'a*');
    await fireEvent.click(container.querySelector('button[title="Backup as JSON (data only)"]')!);
    await waitFor(() => expect(report()).toBeTruthy());
    expect(report()!.querySelector('.ir-title')!.textContent).toBe('Fix this problem before exporting');
    expect(report()!.querySelector('.ir-list.error')!.textContent).toMatch(/answer:/);
    expect(io.exported).toEqual([]);
    await closeReport();

    await type(container, 'Answer formula', 'a*2');
    await fireEvent.click(container.querySelector('button[title="Backup as JSON (data only)"]')!);
    await waitFor(() => expect(io.exported).toHaveLength(1));
    expect(report()).toBeNull();
  });
});
