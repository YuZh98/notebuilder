import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Notebook } from './lib/types';
import type { CardType } from './lib/card-types';

// App "inside Tauri" against an in-memory fake of lib/db, to pin how hydration seeds the built-in
// card types (lib/builtin-seed.ts): once per install, ever, with new built-ins reaching old users.
const h = vi.hoisted(() => ({
  types: [] as CardType[],
  prefs: {} as Record<string, string>,
  calls: [] as string[],
  prefWrites: [] as Array<[string, string]>,
  failTypeSave: false,
}));

vi.mock('./lib/db', () => ({
  isTauri: () => true,
  onDbError: vi.fn(),
  dbIdle: vi.fn(async () => {}),
  listNotebooks: vi.fn(async () => [{ id: 'nbA', name: 'Alpha', created_at: '', updated_at: '', data: '{}' }]),
  loadNotebook: vi.fn(async (): Promise<Notebook> => ({
    id: 'nbA',
    name: 'Alpha',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    cats: [],
    sections: [
      {
        id: 'sA',
        notebookId: 'nbA',
        name: 'Section',
        position: 0,
        cards: [{ id: 'cA', sectionId: 'sA', position: 0, slots: [{ id: 'slA', type: 'text', props: { text: 'hello Alpha' } }] }],
      },
    ],
  })),
  saveNotebook: vi.fn(async () => true),
  deleteNotebook: vi.fn(async () => true),
  loadReaderState: vi.fn(async () => ({})),
  saveReaderState: vi.fn(async () => true),
  getPreference: vi.fn(async (key: string) => h.prefs[key] ?? null),
  setPreference: vi.fn(async (key: string, value: string) => {
    h.calls.push(`setPreference:${key}`);
    h.prefWrites.push([key, value]);
    return true;
  }),
  listCardTypes: vi.fn(async () => structuredClone(h.types)),
  saveCardType: vi.fn(async (ct: CardType) => {
    h.calls.push(`saveCardType:${ct.id}`);
    return !h.failTypeSave;
  }),
  deleteCardType: vi.fn(async () => true),
  saveAnnotation: vi.fn(async () => true),
  deleteAnnotation: vi.fn(async () => true),
  loadAnnotations: vi.fn(async () => []),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: vi.fn(async () => () => {}) }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(async () => true),
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

import App from './App.svelte';
import { builtinCardTypes } from './lib/card-types';
import { LEGACY_BUILTIN_IDS } from './lib/builtin-seed';

const NEW_IDS = ['ct_guided', 'ct_worked', 'ct_practiceset'];
const CUSTOM: CardType = { id: 'ct_custom', name: 'Custom Type', slots: [{ type: 'text', props: { text: 'c' } }] };
const builtin = (id: string) => structuredClone(builtinCardTypes.find((t) => t.id === id)!);
const seededWrites = () => h.prefWrites.filter(([k]) => k === 'builtin_seeded').map(([, v]) => JSON.parse(v));

async function galleryNames(container: HTMLElement): Promise<string[]> {
  const open = [...container.querySelectorAll('button.add-card')].find((b) => b.textContent?.includes('gallery'));
  expect(open, 'gallery button').toBeTruthy();
  await fireEvent.click(open!);
  await tick();
  return [...container.querySelectorAll('.gallery-item')].map((el) => el.textContent ?? '');
}

/** Hydration finished: the loaded notebook shows and the undo history was reset. */
async function hydrated(container: HTMLElement) {
  await waitFor(() => expect(container.textContent).toContain('hello Alpha'));
  await new Promise((r) => setTimeout(r, 30));
  await tick();
}

beforeEach(() => {
  h.types = [];
  h.prefs = {};
  h.calls = [];
  h.prefWrites = [];
  h.failTypeSave = false;
});

afterEach(() => {
  cleanup();
});

describe('App hydration — seeding built-in card types', () => {
  it('an install from before the record existed receives only the new built-ins; deleted legacy ones stay gone', async () => {
    const kept = LEGACY_BUILTIN_IDS.filter((id) => id !== 'ct_payoff');
    h.types = [...kept.map(builtin), CUSTOM];
    const { container } = render(App);
    await hydrated(container);
    expect(h.calls.filter((c) => c.startsWith('saveCardType'))).toEqual(NEW_IDS.map((id) => `saveCardType:${id}`));
    // The record is written after the types it records, and counts the deleted legacy type as seeded.
    expect(h.calls.at(-1)).toBe('setPreference:builtin_seeded');
    expect(seededWrites()).toEqual([[...LEGACY_BUILTIN_IDS, ...NEW_IDS]]);
    const names = await galleryNames(container);
    expect(names.some((n) => n.includes('Guided Explore'))).toBe(true);
    expect(names.some((n) => n.includes('Custom Type'))).toBe(true);
    expect(names.some((n) => n.includes('Option Payoff'))).toBe(false);
  });

  it('an up-to-date install writes nothing, and a built-in the user deleted is not brought back', async () => {
    const all = builtinCardTypes.map((t) => t.id);
    h.types = [...all.filter((id) => id !== 'ct_practiceset').map(builtin), CUSTOM];
    h.prefs = { builtin_seeded: JSON.stringify(all) };
    const { container } = render(App);
    await hydrated(container);
    expect(h.calls).toEqual([]);
    const names = await galleryNames(container);
    expect(names.some((n) => n.includes('Worked Example'))).toBe(true);
    expect(names.some((n) => n.includes('Practice Set'))).toBe(false);
  });

  it('a brand-new install seeds every built-in and records them', async () => {
    const { container } = render(App);
    await hydrated(container);
    const all = builtinCardTypes.map((t) => t.id);
    expect(h.calls.filter((c) => c.startsWith('saveCardType'))).toEqual(all.map((id) => `saveCardType:${id}`));
    expect(seededWrites()).toEqual([all]);
    const names = await galleryNames(container);
    for (const ct of builtinCardTypes) expect(names.some((n) => n.includes(ct.name)), ct.name).toBe(true);
  });

  it('a built-in that cannot be stored fails the load (persistence stays off), and nothing is recorded', async () => {
    h.types = [CUSTOM];
    h.failTypeSave = true;
    render(App);
    await waitFor(() => expect(document.body.textContent).toMatch(/won’t be saved/));
    expect(seededWrites()).toEqual([]);
  });
});
