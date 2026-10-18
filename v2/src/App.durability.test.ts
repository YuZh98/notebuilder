import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Notebook } from './lib/types';
import type { CardType } from './lib/card-types';

// App running "inside Tauri" against an in-memory fake of lib/db, to pin the durability wiring:
// hydration guard, flush on switch/new/blur/hide/close/quit, and undo resyncing card types.
const h = vi.hoisted(() => ({
  notebooks: [] as Notebook[],
  types: [] as CardType[],
  saves: [] as Notebook[],
  reader: {} as Record<string, Record<string, Record<string, unknown>>>,
  readerSaves: [] as Record<string, unknown>[],
  calls: [] as string[],
  hydrationGate: null as Promise<void> | null,
  readerGate: null as Promise<void> | null,
  failHydration: false,
  closeHandler: null as null | ((e: unknown) => unknown),
  events: {} as Record<string, (e: unknown) => unknown>,
  invoked: [] as string[],
}));

vi.mock('./lib/db', () => ({
  isTauri: () => true,
  onDbError: vi.fn(),
  dbIdle: vi.fn(async () => {}),
  listNotebooks: vi.fn(async () => {
    if (h.hydrationGate) await h.hydrationGate;
    if (h.failHydration) throw new Error('database is locked');
    return h.notebooks.map((n) => ({ id: n.id, name: n.name, created_at: '', updated_at: '', data: '{}' }));
  }),
  loadNotebook: vi.fn(async (id: string) => structuredClone(h.notebooks.find((n) => n.id === id) ?? null)),
  saveNotebook: vi.fn(async (nb: Notebook) => {
    h.saves.push(structuredClone(nb));
    h.calls.push(`saveNotebook:${nb.id}`);
    return true;
  }),
  deleteNotebook: vi.fn(async (id: string) => {
    h.calls.push(`deleteNotebook:${id}`);
    return true;
  }),
  loadReaderState: vi.fn(async () => {
    if (h.readerGate) await h.readerGate;
    return structuredClone(h.reader);
  }),
  saveReaderState: vi.fn(async (map: Record<string, unknown>) => {
    h.calls.push('saveReaderState');
    h.readerSaves.push(structuredClone(map));
    return true;
  }),
  getPreference: vi.fn(async () => null),
  setPreference: vi.fn(async (key: string) => {
    h.calls.push(`setPreference:${key}`);
    return true;
  }),
  listCardTypes: vi.fn(async () => structuredClone(h.types)),
  saveCardType: vi.fn(async (ct: CardType) => {
    h.calls.push(`saveCardType:${ct.id}`);
    return true;
  }),
  deleteCardType: vi.fn(async (id: string) => {
    h.calls.push(`deleteCardType:${id}`);
    return true;
  }),
  saveAnnotation: vi.fn(async () => true),
  deleteAnnotation: vi.fn(async () => true),
  loadAnnotations: vi.fn(async () => []),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: (e: unknown) => unknown) => {
    h.events[name] = cb;
    return () => {};
  }),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async (cb: (e: unknown) => unknown) => {
      h.closeHandler = cb;
      return () => {};
    }),
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    h.invoked.push(cmd);
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(async () => true),
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

import App from './App.svelte';
import { mode } from './lib/stores/mode';
import { place } from './lib/stores/place';

const nb = (id: string, name: string): Notebook => ({
  id,
  name,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  cats: [],
  sections: [
    {
      id: `${id}_s`,
      notebookId: id,
      name: 'Section',
      position: 0,
      cards: [
        {
          id: `${id}_c`,
          sectionId: `${id}_s`,
          position: 0,
          slots: [{ id: `${id}_sl`, type: 'text', props: { text: `hello ${name}` } }],
        },
      ],
    },
  ],
});

const CUSTOM: CardType = { id: 'ct_custom', name: 'Custom Type', slots: [{ type: 'text', props: {} }] } as CardType;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cardCount = (n: Notebook) => n.sections.reduce((k, s) => k + s.cards.length, 0);
const savesOf = (id: string) => h.saves.filter((s) => s.id === id);

async function addNote(container: HTMLElement) {
  const btn = [...container.querySelectorAll('button.add-card')].find((b) => b.textContent?.includes('note'));
  expect(btn, '+ note button').toBeTruthy();
  await fireEvent.click(btn!);
  await tick();
}

async function hydrated(container: HTMLElement, name: string) {
  await waitFor(() => expect(container.textContent).toContain(`hello ${name}`));
  await tick();
}

beforeEach(() => {
  h.notebooks = [nb('nbA', 'Alpha'), nb('nbB', 'Beta')];
  h.types = [CUSTOM];
  h.saves = [];
  h.reader = {};
  h.readerSaves = [];
  h.calls = [];
  h.hydrationGate = null;
  h.readerGate = null;
  h.failHydration = false;
  h.closeHandler = null;
  h.events = {};
  h.invoked = [];
});

afterEach(() => {
  mode.set('edit');
  place.set('house');
});

describe('App durability — hydration guard', () => {
  it('persists nothing (demo notebook, reader state, factory) before hydration finished', async () => {
    let release!: () => void;
    h.hydrationGate = new Promise((r) => (release = r));
    const { container } = render(App);
    await tick();
    await addNote(container); // edits the pre-hydration demo notebook
    window.dispatchEvent(new Event('blur'));
    await wait(750);
    expect(h.calls.filter((c) => !c.startsWith('setPreference:theme'))).toEqual([]);
    release();
    await hydrated(container, 'Alpha');
    await wait(750);
    expect(h.saves.map((s) => s.id)).not.toContain('nb_demo');
    // Storage already holds what was just loaded — no redundant rewrite on blur.
    window.dispatchEvent(new Event('blur'));
    await wait(20);
    expect(h.calls.filter((c) => c.startsWith('save'))).toEqual([]);
  });

  it('an edit made to the loaded notebook while the rest of hydration is still running is saved', async () => {
    let release!: () => void;
    h.readerGate = new Promise((r) => (release = r)); // the notebook is loaded, reader state is not
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container);
    release();
    await waitFor(() => expect(savesOf('nbA').length).toBeGreaterThan(0), { timeout: 1500 });
    expect(cardCount(savesOf('nbA').at(-1)!)).toBe(2);
  });

  it('a failed hydration keeps persistence off and says changes won’t be saved', async () => {
    h.failHydration = true;
    const { container } = render(App);
    await waitFor(() => expect(document.body.textContent).toMatch(/won’t be saved/));
    await addNote(container);
    window.dispatchEvent(new Event('blur'));
    await wait(750);
    expect(h.calls).toEqual([]);
  });
});

describe('App durability — flushes', () => {
  it('debounced autosave writes the edit after the quiet period', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container);
    expect(savesOf('nbA')).toHaveLength(0);
    await waitFor(() => expect(savesOf('nbA').length).toBeGreaterThan(0), { timeout: 1500 });
    expect(cardCount(savesOf('nbA').at(-1)!)).toBe(2);
  });

  it('window blur saves the current state immediately (no pending debounce needed)', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container);
    window.dispatchEvent(new Event('blur'));
    await wait(20);
    expect(savesOf('nbA')).toHaveLength(1);
    expect(cardCount(savesOf('nbA')[0])).toBe(2);
  });

  it('visibilitychange → hidden saves immediately', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await wait(20);
    } finally {
      delete (document as unknown as { visibilityState?: string }).visibilityState;
    }
    expect(cardCount(savesOf('nbA')[0])).toBe(2);
  });

  it('switching notebooks saves the outgoing notebook’s last edits first', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container);
    await fireEvent.click(container.querySelector('[data-act="nbmenu"]')!);
    const beta = [...container.querySelectorAll('.nbitem')].find((b) => b.textContent?.includes('Beta'));
    await fireEvent.click(beta!);
    await hydrated(container, 'Beta');
    await wait(750);
    expect(savesOf('nbA')).toHaveLength(1);
    expect(cardCount(savesOf('nbA')[0])).toBe(2);
    // The freshly loaded notebook is not rewritten just for being opened.
    expect(savesOf('nbB')).toHaveLength(0);
  });

  it('a new notebook is saved at once, after the outgoing one', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container);
    await fireEvent.click(container.querySelector('button[title="New notebook"]')!);
    await wait(20);
    const ids = h.saves.map((s) => s.id);
    expect(ids[0]).toBe('nbA');
    expect(cardCount(h.saves[0])).toBe(2);
    expect(ids.length).toBe(2);
    expect(ids[1]).not.toBe('nbA');
  });

  it('the window close handler flushes and resolves so the window can close', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    expect(h.closeHandler).toBeTypeOf('function');
    await addNote(container);
    await h.closeHandler!({ preventDefault() {} });
    expect(cardCount(savesOf('nbA').at(-1)!)).toBe(2);
  });

  it('Cmd+Q (app://flush-then-exit) flushes, then asks Rust to exit', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container);
    expect(h.events['app://flush-then-exit']).toBeTypeOf('function');
    await h.events['app://flush-then-exit']({});
    expect(cardCount(savesOf('nbA').at(-1)!)).toBe(2);
    expect(h.invoked).toEqual(['exit_app']);
  });
});

describe('App durability — deleting a notebook', () => {
  it('deletes it, never saves it again, prunes its reader state and opens the next one', async () => {
    h.reader = { nbA_c: { nbA_sl: { v: 1 } }, nbB_c: { nbB_sl: { v: 2 } } };
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    await addNote(container); // a pending debounced save of the doomed notebook
    const del = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Delete notebook'));
    await fireEvent.click(del!);
    await hydrated(container, 'Beta');
    await wait(750);
    expect(h.calls).toContain('deleteNotebook:nbA');
    expect(savesOf('nbA')).toHaveLength(0);
    expect(savesOf('nbB')).toHaveLength(0);
    // The deleted notebook's reader rows are dropped in memory, so the full-replace save agrees.
    expect(h.readerSaves.at(-1)).toEqual({ nbB_c: { nbB_sl: { v: 2 } } });
  });
});

describe('App durability — undo/redo resyncs card types to storage', () => {
  it('undoing a card-type delete writes it back; redo deletes it again', async () => {
    const { container } = render(App);
    await hydrated(container, 'Alpha');
    const gallery = [...container.querySelectorAll('button.add-card')].find((b) => b.textContent?.includes('gallery'));
    await fireEvent.click(gallery!);
    await tick();
    const item = [...container.querySelectorAll('.gallery-item')].find((el) => el.textContent?.includes('Custom Type'));
    await fireEvent.click(item!.querySelector('.gallery-del')!);
    await waitFor(() => expect(h.calls).toContain('deleteCardType:ct_custom'));
    h.calls = [];
    await fireEvent.click(container.querySelector('button[title="Undo"]')!);
    await tick();
    expect(h.calls).toContain('saveCardType:ct_custom');
    expect(h.calls.filter((c) => c.startsWith('deleteCardType'))).toEqual([]);
    h.calls = [];
    await fireEvent.click(container.querySelector('button[title="Redo"]')!);
    await tick();
    expect(h.calls).toContain('deleteCardType:ct_custom');
  });
});
