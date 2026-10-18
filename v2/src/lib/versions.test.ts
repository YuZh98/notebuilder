import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVersionKeeper, type VersionKeeperDeps } from './versions';
import { contentHash, type SnapshotMeta, type SnapshotReason } from './snapshots';
import type { Notebook } from './types';

const MIN = 60_000;
const T0 = Date.parse('2026-10-18T12:00:00.000Z');

const nb = (id: string, text: string): Notebook => ({
  id,
  name: `NB ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cats: [],
  sections: [
    {
      id: `${id}_s`,
      notebookId: id,
      name: 'S',
      position: 0,
      cards: [{ id: `${id}_c`, sectionId: `${id}_s`, position: 0, slots: [{ id: 'x', type: 'text', props: { text } }] }],
    },
  ],
});

type Stored = { nb: Notebook; reason: SnapshotReason; at: number; id: string };

/** An in-memory snapshots table behind the keeper's two I/O hooks, with a controllable clock. */
function harness(seed: Stored[] = []) {
  const stored: Stored[] = [...seed];
  let clock = T0;
  let saveOk = true;
  let n = 0;
  const lists: Array<[string, SnapshotMeta[]]> = [];
  const meta = (s: Stored): SnapshotMeta => ({
    id: s.id,
    createdAt: new Date(s.at).toISOString(),
    reason: s.reason,
    cardCount: s.nb.sections.reduce((k, x) => k + x.cards.length, 0),
    hash: contentHash(s.nb),
  });
  const deps: VersionKeeperDeps = {
    list: vi.fn(async (id: string) =>
      stored
        .filter((s) => s.nb.id === id)
        .sort((a, b) => b.at - a.at)
        .map(meta),
    ),
    save: vi.fn(async (snap: Notebook, reason: SnapshotReason, at: number) => {
      if (!saveOk) return false;
      stored.push({ nb: structuredClone(snap), reason, at, id: `v${++n}` });
      return true;
    }),
    enabled: vi.fn(() => true),
    onlist: (id, list) => lists.push([id, list]),
    now: () => clock,
  };
  return {
    stored,
    deps,
    lists,
    keeper: createVersionKeeper(deps),
    advance: (ms: number) => (clock += ms),
    failSaves: (fail: boolean) => (saveOk = !fail),
    reasons: (id: string) => stored.filter((s) => s.nb.id === id).map((s) => s.reason),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('version keeper — automatic snapshots after saves', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('the first save of a notebook without versions takes one', async () => {
    expect(await h.keeper.saved(nb('a', 'one'))).toBe(true);
    expect(h.reasons('a')).toEqual(['auto']);
  });

  it('takes at most one inside the 10-minute window, however many saves land', async () => {
    await h.keeper.saved(nb('a', 'one'));
    for (let i = 0; i < 5; i++) {
      h.advance(MIN);
      expect(await h.keeper.saved(nb('a', `edit ${i}`))).toBe(false);
    }
    expect(h.reasons('a')).toEqual(['auto']);
    h.advance(5 * MIN); // 10 min since the first
    expect(await h.keeper.saved(nb('a', 'later'))).toBe(true);
    expect(h.reasons('a')).toEqual(['auto', 'auto']);
  });

  it('takes none after the window when the content did not change', async () => {
    await h.keeper.saved(nb('a', 'one'));
    h.advance(60 * MIN);
    expect(await h.keeper.saved({ ...nb('a', 'one'), updatedAt: 'later' })).toBe(false);
    expect(h.reasons('a')).toEqual(['auto']);
  });

  it('learns the newest stored version once per notebook (after a restart) and gates on its hash', async () => {
    const h2 = harness([{ nb: nb('a', 'one'), reason: 'auto', at: T0 - 60 * MIN, id: 'old' }]);
    expect(await h2.keeper.saved(nb('a', 'one'))).toBe(false); // same content as stored
    expect(await h2.keeper.saved(nb('a', 'two'))).toBe(true); // changed, an hour later
    expect(h2.deps.list).toHaveBeenCalledTimes(2); // the seed read, then the refresh after the save
  });

  it('respects a stored version from 3 minutes ago (rate limit survives a restart)', async () => {
    const h2 = harness([{ nb: nb('a', 'one'), reason: 'manual', at: T0 - 3 * MIN, id: 'recent' }]);
    expect(await h2.keeper.saved(nb('a', 'two'))).toBe(false);
    h2.advance(7 * MIN);
    expect(await h2.keeper.saved(nb('a', 'two'))).toBe(true);
  });

  it('concurrent first saves of an unknown notebook take only one', async () => {
    const results = await Promise.all([h.keeper.saved(nb('a', 'one')), h.keeper.saved(nb('a', 'two'))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(h.reasons('a')).toEqual(['auto']);
  });

  it('keeps notebooks apart', async () => {
    await h.keeper.saved(nb('a', 'one'));
    expect(await h.keeper.saved(nb('b', 'one'))).toBe(true);
    expect(h.reasons('b')).toEqual(['auto']);
  });

  it('a failed snapshot write is retried by the next save instead of rate-limiting it', async () => {
    h.failSaves(true);
    expect(await h.keeper.saved(nb('a', 'one'))).toBe(false);
    h.failSaves(false);
    h.advance(MIN);
    expect(await h.keeper.saved(nb('a', 'one'))).toBe(true);
    expect(h.reasons('a')).toEqual(['auto']);
  });

  it('a list that cannot be read takes no snapshot now and is retried later', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(h.deps.list).mockRejectedValueOnce(new Error('locked'));
    expect(await h.keeper.saved(nb('a', 'one'))).toBe(false);
    expect(h.reasons('a')).toEqual([]);
    expect(await h.keeper.saved(nb('a', 'one'))).toBe(true);
    warn.mockRestore();
  });

  it('does nothing while persistence is off', async () => {
    vi.mocked(h.deps.enabled).mockReturnValue(false);
    expect(await h.keeper.saved(nb('a', 'one'))).toBe(false);
    await h.keeper.opened(nb('a', 'one'), true);
    expect(await h.keeper.take(nb('a', 'one'), 'manual')).toBe(false);
    expect(h.deps.list).not.toHaveBeenCalled();
    expect(h.deps.save).not.toHaveBeenCalled();
  });

  it('enqueues the snapshot synchronously once the newest is known (a close flush still covers it)', async () => {
    await h.keeper.saved(nb('a', 'one'));
    h.advance(11 * MIN);
    vi.mocked(h.deps.save).mockClear();
    void h.keeper.saved(nb('a', 'two'));
    expect(h.deps.save).toHaveBeenCalledTimes(1);
  });
});

describe('version keeper — opening a notebook', () => {
  it('lists its versions for the panel', async () => {
    const h = harness([{ nb: nb('a', 'one'), reason: 'manual', at: T0 - 60 * MIN, id: 'm' }]);
    await h.keeper.opened(nb('a', 'one'), false);
    expect(h.lists.at(-1)?.[0]).toBe('a');
    expect(h.lists.at(-1)?.[1].map((v) => v.id)).toEqual(['m']);
  });

  it('a stored notebook that changed since its newest version gets a baseline version', async () => {
    const h = harness([{ nb: nb('a', 'one'), reason: 'auto', at: T0 - 60 * MIN, id: 'old' }]);
    await h.keeper.opened(nb('a', 'edited after that version'), true);
    expect(h.reasons('a')).toEqual(['auto', 'auto']);
    await flush();
    expect(h.lists.at(-1)?.[1]).toHaveLength(2); // the panel list was refreshed after the save
  });

  it('a stored notebook with no versions gets one; an unchanged one does not', async () => {
    const h = harness([{ nb: nb('b', 'same'), reason: 'auto', at: T0 - 60 * MIN, id: 'old' }]);
    await h.keeper.opened(nb('a', 'one'), true);
    await h.keeper.opened(nb('b', 'same'), true);
    expect(h.reasons('a')).toEqual(['auto']);
    expect(h.reasons('b')).toEqual(['auto']);
  });

  it('a new (not yet stored) notebook only lists — its first save takes the version', async () => {
    const h = harness();
    await h.keeper.opened(nb('a', 'one'), false);
    expect(h.deps.save).not.toHaveBeenCalled();
  });
});

describe('version keeper — explicit versions', () => {
  it('take() always stores, and counts for the rate limit', async () => {
    const h = harness();
    expect(await h.keeper.take(nb('a', 'one'), 'manual')).toBe(true);
    expect(await h.keeper.take(nb('a', 'one'), 'manual')).toBe(true); // identical content still stored
    expect(await h.keeper.saved(nb('a', 'two'))).toBe(false);
    expect(h.reasons('a')).toEqual(['manual', 'manual']);
    expect(h.stored[0].at).toBe(T0);
  });

  it('a take() before the list arrives is not undone by that (older) list', async () => {
    const h = harness([{ nb: nb('a', 'zero'), reason: 'auto', at: T0 - 60 * MIN, id: 'old' }]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realList = h.deps.list;
    const stale = await realList('a');
    vi.mocked(h.deps.list).mockImplementationOnce(async () => {
      await gate;
      return stale; // read queued before the manual write
    });
    const opening = h.keeper.opened(nb('a', 'zero'), false);
    await h.keeper.take(nb('a', 'one'), 'manual');
    release();
    await opening;
    // The newest is still the manual one: a save 1 minute later is rate-limited.
    h.advance(MIN);
    expect(await h.keeper.saved(nb('a', 'two'))).toBe(false);
  });

  it('forget() drops what it knew, so a reused id is learned afresh', async () => {
    const h = harness();
    await h.keeper.saved(nb('a', 'one'));
    h.stored.length = 0; // the notebook and its versions were deleted
    h.keeper.forget('a');
    expect(await h.keeper.saved(nb('a', 'two'))).toBe(true);
  });
});
