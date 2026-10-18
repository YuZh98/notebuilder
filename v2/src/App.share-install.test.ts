import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Notebook } from './lib/types';

// App "inside Tauri" against an in-memory fake of lib/db: a shared file's docId is this install's
// stored random id plus the notebook id, so two installs' demo notebooks ('nb_demo') never share
// one student's saved progress, while a re-share of one notebook keeps it.
const h = vi.hoisted(() => ({
  notebooks: [] as Notebook[],
  prefs: {} as Record<string, string>,
  prefWrites: [] as [string, string][],
  shared: [] as { id: string; theme?: string; docId?: string }[],
}));

vi.mock('./lib/db', () => ({
  isTauri: () => true,
  onDbError: vi.fn(),
  dbIdle: vi.fn(async () => {}),
  listNotebooks: vi.fn(async () =>
    h.notebooks.map((n) => ({ id: n.id, name: n.name, created_at: '', updated_at: '', data: '{}' })),
  ),
  loadNotebook: vi.fn(async (id: string) => structuredClone(h.notebooks.find((n) => n.id === id) ?? null)),
  saveNotebook: vi.fn(async () => true),
  deleteNotebook: vi.fn(async () => true),
  loadReaderState: vi.fn(async () => ({})),
  saveReaderState: vi.fn(async () => true),
  getPreference: vi.fn(async (key: string) => h.prefs[key] ?? null),
  setPreference: vi.fn(async (key: string, value: string) => {
    h.prefWrites.push([key, value]);
    h.prefs[key] = value;
    return true;
  }),
  listCardTypes: vi.fn(async () => []),
  saveCardType: vi.fn(async () => true),
  deleteCardType: vi.fn(async () => true),
  saveAnnotation: vi.fn(async () => true),
  deleteAnnotation: vi.fn(async () => true),
  loadAnnotations: vi.fn(async () => []),
  saveSnapshot: vi.fn(async () => true),
  listSnapshots: vi.fn(async () => []),
  loadSnapshot: vi.fn(async () => null),
}));

vi.mock('./lib/share', async (orig) => ({
  ...(await orig<typeof import('./lib/share')>()),
  shareNotebookToFile: vi.fn(async (nb: Notebook, theme?: string, docId?: string) => {
    h.shared.push({ id: nb.id, theme, docId });
    return { path: `${nb.name}.html` };
  }),
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
import { demoNotebook } from './lib/demo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The stored copy of the demo (same id 'nb_demo') is renamed, so the test can see it loaded.
const storedDemo = (): Notebook => ({ ...demoNotebook(), name: 'Stored Demo' });

async function ready(container: HTMLElement) {
  await waitFor(() => expect(container.textContent).toContain('Stored Demo'));
  // Persistence opens once the rest of the (all-immediate, mocked) load has finished.
  await new Promise((r) => setTimeout(r, 30));
  await tick();
}

async function share(container: HTMLElement) {
  const before = h.shared.length;
  await fireEvent.click(container.querySelector('.share-btn')!);
  await waitFor(() => expect(h.shared.length).toBe(before + 1));
  return h.shared.at(-1)!;
}

beforeEach(() => {
  h.notebooks = [storedDemo()];
  h.prefs = { builtin_seeded: JSON.stringify(builtinCardTypes.map((t) => t.id)) };
  h.prefWrites = [];
  h.shared = [];
});

describe('App — shared files carry a per-install docId', () => {
  it('first share on an install creates and stores install_id, and the docId is `${installId}:${notebook.id}`', async () => {
    const { container } = render(App);
    await ready(container);
    const s = await share(container);
    const writes = h.prefWrites.filter(([k]) => k === 'install_id');
    expect(writes).toHaveLength(1);
    const installId = writes[0][1];
    expect(installId).toMatch(UUID);
    expect(s.docId).toBe(`${installId}:nb_demo`);
  });

  it('a later share (and a later launch) reuses the stored id: same notebook → same docId', async () => {
    h.prefs.install_id = '0b9c1c6e-6f1e-4b7e-9a51-1f0d6f2a9c11';
    const { container, unmount } = render(App);
    await ready(container);
    const first = await share(container);
    const again = await share(container);
    expect(first.docId).toBe('0b9c1c6e-6f1e-4b7e-9a51-1f0d6f2a9c11:nb_demo');
    expect(again.docId).toBe(first.docId);
    expect(h.prefWrites.filter(([k]) => k === 'install_id')).toEqual([]);
    unmount();

    const relaunch = render(App);
    await ready(relaunch.container);
    expect((await share(relaunch.container)).docId).toBe(first.docId);
  });

  it('another install sharing its own demo notebook gets a different docId', async () => {
    h.prefs.install_id = '0b9c1c6e-6f1e-4b7e-9a51-1f0d6f2a9c11';
    const a = render(App);
    await ready(a.container);
    const fromA = await share(a.container);
    a.unmount();

    h.prefs = { builtin_seeded: h.prefs.builtin_seeded, install_id: 'f3a2e1d0-1111-4222-8333-944455556666' };
    const b = render(App);
    await ready(b.container);
    const fromB = await share(b.container);
    expect(fromA.id).toBe(fromB.id); // both 'nb_demo'
    expect(fromA.docId).not.toBe(fromB.docId);
  });
});
