import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Notebook } from './lib/types';

// App "inside Tauri" against an in-memory fake of lib/db with a snapshots table, to pin the W7
// wiring: automatic versions ride on successful autosaves (hash-gated, rate-limited, never
// before hydration), "Save version now", and an undoable Restore that keeps the notebook id.
const h = vi.hoisted(() => ({
  notebooks: [] as Notebook[],
  saves: [] as Notebook[],
  snaps: [] as { id: string; nb: Notebook; reason: string; at: number }[],
  n: 0,
  now: 0,
  failHydration: false,
  hydrationGate: null as Promise<void> | null,
  confirmAnswer: true,
  confirms: [] as string[],
}));

vi.mock('./lib/db', async () => {
  const { contentHash } = await import('./lib/snapshots');
  const meta = (s: (typeof h.snaps)[number]) => ({
    id: s.id,
    createdAt: new Date(s.at).toISOString(),
    reason: s.reason,
    cardCount: s.nb.sections.reduce((k, x) => k + x.cards.length, 0),
    hash: contentHash(s.nb),
  });
  return {
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
      h.notebooks = [...h.notebooks.filter((n) => n.id !== nb.id), structuredClone(nb)];
      return true;
    }),
    deleteNotebook: vi.fn(async () => true),
    loadReaderState: vi.fn(async () => ({})),
    saveReaderState: vi.fn(async () => true),
    getPreference: vi.fn(async () => null),
    setPreference: vi.fn(async () => true),
    listCardTypes: vi.fn(async () => []),
    saveCardType: vi.fn(async () => true),
    deleteCardType: vi.fn(async () => true),
    saveAnnotation: vi.fn(async () => true),
    deleteAnnotation: vi.fn(async () => true),
    loadAnnotations: vi.fn(async () => []),
    saveSnapshot: vi.fn(async (nb: Notebook, reason: string, at: number = Date.now()) => {
      h.snaps.push({ id: `snap${++h.n}`, nb: structuredClone(nb), reason, at });
      return true;
    }),
    listSnapshots: vi.fn(async (id: string) =>
      h.snaps
        .filter((s) => s.nb.id === id)
        .sort((a, b) => b.at - a.at)
        .map(meta),
    ),
    loadSnapshot: vi.fn(async (id: string) => structuredClone(h.snaps.find((s) => s.id === id)?.nb ?? null)),
  };
});

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: vi.fn(async () => () => {}) }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(async (msg: string) => {
    h.confirms.push(msg);
    return h.confirmAnswer;
  }),
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

import App from './App.svelte';
import { saveSnapshot, listSnapshots } from './lib/db';
import { mode } from './lib/stores/mode';
import { place } from './lib/stores/place';

const MIN = 60_000;
const T0 = Date.parse('2026-10-18T12:00:00.000Z');

const nb = (id: string, name: string, texts: string[] = [`hello ${name}`]): Notebook => ({
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
      cards: texts.map((text, i) => ({
        id: `${id}_c${i}`,
        sectionId: `${id}_s`,
        position: i,
        slots: [{ id: `${id}_sl${i}`, type: 'text', props: { text } }],
      })),
    },
  ],
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cardCount = (n: Notebook) => n.sections.reduce((k, s) => k + s.cards.length, 0);
const snapsOf = (id: string) => h.snaps.filter((s) => s.nb.id === id);
const savesOf = (id: string) => h.saves.filter((s) => s.id === id);

async function hydrated(container: HTMLElement, text: string) {
  await waitFor(() => expect(container.textContent).toContain(text));
  await tick();
  await wait(0);
}

async function addNote(container: HTMLElement) {
  const btn = [...container.querySelectorAll('button.add-card')].find((b) => b.textContent?.includes('note'));
  await fireEvent.click(btn!);
  await tick();
}

/** Add a note and wait until the debounced autosave of it has landed. */
async function editAndAutosave(container: HTMLElement, id = 'nbA') {
  const before = savesOf(id).length;
  await addNote(container);
  await waitFor(() => expect(savesOf(id).length).toBeGreaterThan(before), { timeout: 2000 });
  await wait(0);
}

async function openVersions() {
  await fireEvent.click(await screen.findByRole('button', { name: /versions/i }));
}

beforeEach(() => {
  h.notebooks = [nb('nbA', 'Alpha'), nb('nbB', 'Beta')];
  h.saves = [];
  h.snaps = [];
  h.n = 0;
  h.now = T0;
  h.failHydration = false;
  h.hydrationGate = null;
  h.confirmAnswer = true;
  h.confirms = [];
  vi.spyOn(Date, 'now').mockImplementation(() => h.now);
  vi.mocked(saveSnapshot).mockClear();
  vi.mocked(listSnapshots).mockClear();
});

afterEach(() => {
  vi.mocked(Date.now).mockRestore();
  mode.set('edit');
  place.set('house');
});

describe('App versions — automatic snapshots', () => {
  it('edits → autosave → exactly one automatic version inside the 10-minute window', async () => {
    // Its newest version (an hour old) holds exactly what is stored: opening it keeps nothing new.
    h.snaps = [{ id: 'old', nb: nb('nbA', 'Alpha'), reason: 'auto', at: T0 - 60 * MIN }];
    const { container } = render(App);
    await hydrated(container, 'hello Alpha');
    await wait(20);
    expect(snapsOf('nbA')).toHaveLength(1);

    await editAndAutosave(container);
    expect(snapsOf('nbA').map((s) => s.reason)).toEqual(['auto', 'auto']);
    expect(cardCount(snapsOf('nbA')[1].nb)).toBe(2);

    for (let i = 0; i < 3; i++) {
      h.now += 2 * MIN; // still inside the window
      await editAndAutosave(container);
    }
    expect(snapsOf('nbA')).toHaveLength(2);

    h.now += 5 * MIN; // 11 minutes after the last version
    await editAndAutosave(container);
    expect(snapsOf('nbA')).toHaveLength(3);
    expect(cardCount(snapsOf('nbA')[2].nb)).toBe(6);
  });

  it('a notebook with no versions yet gets one of its stored state when opened', async () => {
    const { container } = render(App);
    await hydrated(container, 'hello Alpha');
    await waitFor(() => expect(snapsOf('nbA')).toHaveLength(1));
    expect(snapsOf('nbA')[0].reason).toBe('auto');
    expect(cardCount(snapsOf('nbA')[0].nb)).toBe(1);
  });

  it('a stored notebook changed since its newest version is kept as it was before today’s edits', async () => {
    h.snaps = [{ id: 'old', nb: nb('nbA', 'Alpha', ['yesterday morning']), reason: 'auto', at: T0 - 20 * 60 * MIN }];
    const { container } = render(App);
    await hydrated(container, 'hello Alpha');
    await waitFor(() => expect(snapsOf('nbA')).toHaveLength(2));
    expect(snapsOf('nbA')[1].nb.sections[0].cards[0].slots[0].props.text).toBe('hello Alpha');
    await editAndAutosave(container); // inside the window now
    expect(snapsOf('nbA')).toHaveLength(2);
  });

  it('nothing is listed or kept before hydration, nor after a failed one', async () => {
    let release!: () => void;
    h.hydrationGate = new Promise((r) => (release = r));
    h.failHydration = true;
    const { container } = render(App);
    await tick();
    await addNote(container); // edits the pre-hydration demo notebook
    await wait(700);
    expect(saveSnapshot).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(document.body.textContent).toMatch(/won’t be saved/));
    await addNote(container);
    await wait(700);
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(listSnapshots).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /versions/i })).toBeNull();
  });

  it('switching notebooks lists the other notebook’s versions', async () => {
    h.snaps = [
      { id: 'a1', nb: nb('nbA', 'Alpha'), reason: 'manual', at: T0 - 60 * MIN },
      { id: 'b1', nb: nb('nbB', 'Beta'), reason: 'auto', at: T0 - 120 * MIN },
      { id: 'b2', nb: nb('nbB', 'Beta'), reason: 'manual', at: T0 - 90 * MIN },
    ];
    const { container } = render(App);
    await hydrated(container, 'hello Alpha');
    await openVersions();
    expect(await screen.findAllByRole('button', { name: /^restore the version/i })).toHaveLength(1);
    await fireEvent.click(container.querySelector('[data-act="nbmenu"]')!);
    const beta = [...container.querySelectorAll('.nbitem')].find((b) => b.textContent?.includes('Beta'));
    await fireEvent.click(beta!);
    await hydrated(container, 'hello Beta');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^restore the version/i })).toHaveLength(2));
  });
});

describe('App versions — the panel', () => {
  it('“Save version now” keeps a manual version and lists it', async () => {
    h.snaps = [{ id: 'old', nb: nb('nbA', 'Alpha'), reason: 'auto', at: T0 - 60 * MIN }];
    const { container } = render(App);
    await hydrated(container, 'hello Alpha');
    await openVersions();
    expect(screen.getByRole('list', { name: /saved versions/i }).textContent).toMatch(/1 h ago/);
    await addNote(container); // unsaved yet: the version is of what is on screen
    await fireEvent.click(screen.getByRole('button', { name: /save version now/i }));
    await waitFor(() => expect(snapsOf('nbA').map((s) => s.reason)).toEqual(['auto', 'manual']));
    expect(cardCount(snapsOf('nbA')[1].nb)).toBe(2);
    await waitFor(() => expect(screen.getByRole('list', { name: /saved versions/i }).textContent).toMatch(/Saved by you/));
    expect(document.body.textContent).toMatch(/Version saved/);
  });
});

describe('App versions — restore', () => {
  const OLD = () => nb('nbA', 'Alpha (draft)', ['old one', 'old two', 'old three']);

  async function restoreOldest(container: HTMLElement) {
    await hydrated(container, 'hello Alpha');
    await openVersions();
    const buttons = await screen.findAllByRole('button', { name: /^restore the version/i });
    await fireEvent.click(buttons.at(-1)!);
  }

  it('confirm → current kept as before-restore → content replaced under the same id → saved now; Undo returns', async () => {
    h.snaps = [{ id: 'old', nb: OLD(), reason: 'manual', at: T0 - 3 * 24 * 60 * MIN }];
    const { container } = render(App);
    await restoreOldest(container);
    await waitFor(() => expect(container.textContent).toContain('old three'));
    expect(h.confirms.at(-1)).toMatch(/restore/i);

    // What was on screen is kept first.
    const before = snapsOf('nbA').find((s) => s.reason === 'before-restore');
    expect(before && cardCount(before.nb)).toBe(1);
    expect(before!.nb.sections[0].cards[0].slots[0].props.text).toBe('hello Alpha');

    // Saved at once (no debounce), under the same id, with the stored card ids.
    await wait(20);
    const saved = savesOf('nbA').at(-1)!;
    expect(saved.sections[0].cards.map((c) => c.id)).toEqual(['nbA_c0', 'nbA_c1', 'nbA_c2']);
    expect(saved.name).toBe('Alpha (draft)');
    expect(container.textContent).not.toContain('hello Alpha');
    expect((container.querySelector('#side input[placeholder="notebook name"]') as HTMLInputElement).value).toBe(
      'Alpha (draft)',
    );
    // The notebook menu follows the restored name, like a rename.
    await fireEvent.click(container.querySelector('[data-act="nbmenu"]')!);
    expect([...container.querySelectorAll('.nbitem')].map((b) => b.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Alpha (draft)')]),
    );
    await fireEvent.click(container.querySelector('[data-act="nbmenu"]')!);

    await fireEvent.click(container.querySelector('button[title="Undo"]')!);
    await tick();
    expect(container.textContent).toContain('hello Alpha');
    expect(container.textContent).not.toContain('old three');
    await waitFor(() => expect(cardCount(savesOf('nbA').at(-1)!)).toBe(1), { timeout: 2000 });
    expect(savesOf('nbA').at(-1)!.name).toBe('Alpha');
    // …and the menu follows the undone name too.
    await fireEvent.click(container.querySelector('[data-act="nbmenu"]')!);
    const names = [...container.querySelectorAll('.nbitem')].map((b) => b.textContent ?? '');
    expect(names.some((t) => t.includes('Alpha (draft)'))).toBe(false);
    expect(names.some((t) => t.includes('Alpha'))).toBe(true);
  });

  it('if the current notebook cannot be kept as a version first, nothing is restored', async () => {
    h.snaps = [{ id: 'old', nb: OLD(), reason: 'manual', at: T0 - 3 * 24 * 60 * MIN }];
    const { container } = render(App);
    await hydrated(container, 'hello Alpha');
    await waitFor(() => expect(snapsOf('nbA')).toHaveLength(2)); // the baseline taken at open
    vi.mocked(saveSnapshot).mockImplementationOnce(async () => false);
    await openVersions();
    const buttons = await screen.findAllByRole('button', { name: /^restore the version/i });
    await fireEvent.click(buttons.at(-1)!);
    await waitFor(() => expect(document.body.textContent).toMatch(/nothing was restored/));
    expect(container.textContent).toContain('hello Alpha');
    expect(container.textContent).not.toContain('old three');
    expect(savesOf('nbA')).toHaveLength(0);
    expect(container.querySelector('button[title="Undo"]')!.hasAttribute('disabled')).toBe(true);
  });

  it('a cancelled restore changes nothing', async () => {
    h.snaps = [{ id: 'old', nb: OLD(), reason: 'manual', at: T0 - 3 * 24 * 60 * MIN }];
    h.confirmAnswer = false;
    const { container } = render(App);
    await restoreOldest(container);
    await wait(50);
    expect(h.confirms).toHaveLength(1);
    expect(container.textContent).toContain('hello Alpha');
    expect(snapsOf('nbA').map((s) => s.reason)).not.toContain('before-restore');
    expect(savesOf('nbA')).toHaveLength(0);
    expect(container.querySelector('button[title="Undo"]')!.hasAttribute('disabled')).toBe(true);
  });

  it('a version pruned meanwhile is reported, and nothing changes', async () => {
    h.snaps = [{ id: 'old', nb: OLD(), reason: 'manual', at: T0 - 3 * 24 * 60 * MIN }];
    const { container } = render(App);
    await hydrated(container, 'hello Alpha');
    await openVersions();
    const [restore] = await screen.findAllByRole('button', { name: /^restore the version/i });
    h.snaps = [];
    await fireEvent.click(restore);
    await waitFor(() => expect(document.body.textContent).toMatch(/no longer available/i));
    expect(container.textContent).toContain('hello Alpha');
    expect(snapsOf('nbA')).toHaveLength(0);
  });
});
