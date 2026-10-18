import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  READER_PREFIX,
  computeKeys,
  createProgressStore,
  cyrb53,
  fromStored,
  installFlushOnHide,
  loadProgress,
  readerDocRef,
  readerStorageKey,
  safeLocalStorage,
  toStored,
  type StorageLike,
} from './reader-store';
import { exportNotebook, importNotebook, type NotebookJSON } from './json-io';
import { CARD_STATE_KEY } from './card-done';
import type { Annotation, Card, Notebook, Slot } from './types';

// ---------- fixtures ----------

let n = 0;
const slot = (type: string, props: Record<string, unknown>): Slot => ({ id: `as${++n}`, type, props });
const choice = (q: string, answer = [0]) => slot('choice', { q, options: ['yes', 'no'], answer });
const input = (placeholder: string) => slot('text-input', { placeholder });

function authorCard(slots: Slot[], over: Partial<Card> = {}): Card {
  return { id: `ac${++n}`, sectionId: 'as', position: 0, slots, ...over };
}

function authorNb(cards: Card[], more: Card[] = []): Notebook {
  return {
    id: 'nb_author',
    name: 'Deck',
    createdAt: '',
    updatedAt: '',
    sections: [
      { id: 'as', notebookId: 'nb_author', name: 'One', position: 0, cards },
      { id: 'as2', notebookId: 'nb_author', name: 'Two', position: 1, cards: more },
    ],
  };
}

/** What a student's Reader holds after opening the shared file: fresh ids every time. */
const open = (json: NotebookJSON): Notebook => importNotebook(structuredClone(json));
const cardsOf = (nb: Notebook): Card[] => nb.sections.flatMap((s) => s.cards);

function baseDeck() {
  const a = authorCard([choice('Q1'), input('why?')]);
  const b = authorCard([choice('Q2')]);
  const c = authorCard([slot('list', { items: ['x', 'y'], style: 'check' })], {
    verbs: { flip: true },
    back: [choice('Q3 back')],
  });
  return { a, b, c, json: exportNotebook(authorNb([a, b], [c])) };
}

/** Fake Storage with an optional character quota that throws a real QuotaExceededError. */
class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    let used = 0;
    for (const [key, val] of this.map) if (key !== k) used += key.length + val.length;
    if (used + k.length + v.length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const throwing = (name = 'SecurityError'): StorageLike => {
  const boom = () => {
    throw new DOMException('denied', name);
  };
  return { length: 0, key: () => null, getItem: boom, setItem: boom, removeItem: boom };
};

afterEach(() => {
  vi.useRealTimers();
});

// ---------- hashing / namespace ----------

describe('cyrb53 / namespace', () => {
  it('is deterministic and content-sensitive', () => {
    expect(cyrb53('hello')).toBe(cyrb53('hello'));
    expect(cyrb53('hello')).not.toBe(cyrb53('hellp'));
    expect(cyrb53('hello')).toMatch(/^[0-9a-z]+$/);
  });

  it('namespaces by docId, falling back to a hash of the payload string', () => {
    expect(readerStorageKey(readerDocRef('nb_x', '{"a":1}'))).toBe('notebuilder:reader:v1:nb_x');
    expect(readerDocRef(undefined, '{"a":1}')).toBe(cyrb53('{"a":1}'));
    expect(readerDocRef('', '{"a":1}')).toBe(cyrb53('{"a":1}'));
    expect(readerStorageKey('abc').startsWith(READER_PREFIX)).toBe(true);
    // a hand-edited payload with a junk docId still gets a stable namespace
    expect(readerDocRef(42, 'p')).toBe(cyrb53('p'));
    expect(readerDocRef('x'.repeat(500), 'p')).toBe(cyrb53('p'));
  });
});

// ---------- stable keys ----------

describe('computeKeys', () => {
  it('gives the same stable keys across two imports of the same payload (ids differ)', () => {
    const { json } = baseDeck();
    const one = open(json);
    const two = open(json);
    expect(cardsOf(one)[0].id).not.toBe(cardsOf(two)[0].id);
    const k1 = computeKeys(one);
    const k2 = computeKeys(two);
    expect(cardsOf(one).map((c) => k1.cardKey.get(c.id))).toEqual(cardsOf(two).map((c) => k2.cardKey.get(c.id)));
    // and the reverse map resolves back to this run's ids
    for (const c of cardsOf(two)) expect(k2.cardId.get(k2.cardKey.get(c.id)!)).toBe(c.id);
  });

  it('keys slots by face and index (f0, f1 … b0) and keeps the card-level key', () => {
    const { json } = baseDeck();
    const nb = open(json);
    const keys = computeKeys(nb);
    const [a, , c] = cardsOf(nb);
    expect(keys.slotKey.get(a.id)!.get(a.slots[0].id)).toBe('f0');
    expect(keys.slotKey.get(a.id)!.get(a.slots[1].id)).toBe('f1');
    expect(keys.slotKey.get(c.id)!.get(c.back![0].id)).toBe('b0');
    expect(keys.slotKey.get(c.id)!.get(CARD_STATE_KEY)).toBe(CARD_STATE_KEY);
  });

  it('disambiguates identical cards with a duplicate ordinal', () => {
    const json = exportNotebook(authorNb([authorCard([choice('same')]), authorCard([choice('same')])]));
    const nb = open(json);
    const keys = computeKeys(nb);
    const [x, y] = cardsOf(nb).map((c) => keys.cardKey.get(c.id)!);
    expect(x).not.toBe(y);
    expect(y).toBe(`${x}.1`);
  });
});

// ---------- toStored / fromStored ----------

describe('toStored / fromStored', () => {
  function answered(nb: Notebook) {
    const [a, b, c] = cardsOf(nb);
    return {
      [a.id]: { [a.slots[0].id]: { selected: [0], submitted: true }, [a.slots[1].id]: { value: 'because' } },
      [b.id]: { [b.slots[0].id]: { selected: [1], submitted: true } },
      [c.id]: {
        [c.slots[0].id]: { checked: [true, false] },
        [c.back![0].id]: { selected: [0] },
        [CARD_STATE_KEY]: { flipped: true, seenBack: true },
      },
    };
  }

  it('round-trips progress onto a fresh import of the same payload', () => {
    const { json } = baseDeck();
    const before = open(json);
    const stored = toStored(answered(before), before);
    const after = open(json);
    const { readerState } = fromStored(stored, after);
    const [a, b, c] = cardsOf(after);
    expect(readerState[a.id][a.slots[1].id]).toEqual({ value: 'because' });
    expect(readerState[b.id][b.slots[0].id]).toEqual({ selected: [1], submitted: true });
    expect(readerState[c.id][c.back![0].id]).toEqual({ selected: [0] });
    expect(readerState[c.id][CARD_STATE_KEY]).toEqual({ seenBack: true });
  });

  it('strips volatile presentation (flipped) before storing, keeping seenBack', () => {
    const { json } = baseDeck();
    const nb = open(json);
    const stored = toStored(answered(nb), nb);
    expect(JSON.stringify(stored)).not.toContain('flipped');
    expect(JSON.stringify(stored)).toContain('seenBack');
  });

  it('keeps every other card’s progress when the author inserts a new card before them', () => {
    const { a, b, c, json } = baseDeck();
    const before = open(json);
    const stored = toStored(answered(before), before);

    const edited = exportNotebook(authorNb([authorCard([choice('NEW first')]), a, b], [c]));
    const after = open(edited);
    const { readerState } = fromStored(stored, after);
    const [fresh, a2, b2, c2] = cardsOf(after);
    expect(readerState[fresh.id]).toBeUndefined();
    expect(readerState[a2.id][a2.slots[0].id]).toEqual({ selected: [0], submitted: true });
    expect(readerState[b2.id][b2.slots[0].id]).toEqual({ selected: [1], submitted: true });
    expect(readerState[c2.id][CARD_STATE_KEY]).toEqual({ seenBack: true });
  });

  it('drops only the edited card’s progress when the author changes its content', () => {
    const { a, b, c, json } = baseDeck();
    const before = open(json);
    const stored = toStored(answered(before), before);

    const b2Author = { ...b, slots: [{ ...b.slots[0], props: { ...b.slots[0].props, q: 'Q2 (fixed typo)' } }] };
    const after = open(exportNotebook(authorNb([a, b2Author], [c])));
    const { readerState, carry } = fromStored(stored, after);
    const [a2, b2, c2] = cardsOf(after);
    expect(readerState[b2.id]).toBeUndefined();
    expect(readerState[a2.id][a2.slots[1].id]).toEqual({ value: 'because' });
    expect(readerState[c2.id][c2.slots[0].id]).toEqual({ checked: [true, false] });
    // the stale entry is carried (not shown) so it is never silently destroyed
    expect(Object.keys(carry.cards)).toHaveLength(1);
  });

  it('keeps progress when the author only moves a card to another section', () => {
    const { a, b, c, json } = baseDeck();
    const before = open(json);
    const stored = toStored(answered(before), before);
    const after = open(exportNotebook(authorNb([a], [c, b])));
    const { readerState } = fromStored(stored, after);
    const moved = after.sections[1].cards[1];
    expect(readerState[moved.id][moved.slots[0].id]).toEqual({ selected: [1], submitted: true });
  });

  it('rekeys annotations by stable card key and drops nothing silently', () => {
    const { a, b, c, json } = baseDeck();
    const before = open(json);
    const [ca, cb] = cardsOf(before);
    const note = (id: string, cardId: string, body: string): Annotation => ({
      id,
      cardId,
      kind: 'note',
      body,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    const annotations = { [ca.id]: [note('ann_1', ca.id, 'remember this')], [cb.id]: [note('ann_2', cb.id, 'hmm')] };
    const stored = toStored({}, before, annotations);
    expect(JSON.stringify(stored)).not.toContain(ca.id);

    const b2Author = { ...b, slots: [{ ...b.slots[0], props: { ...b.slots[0].props, q: 'changed' } }] };
    const after = open(exportNotebook(authorNb([authorCard([input('new')]), a, b2Author], [c])));
    const restored = fromStored(stored, after);
    const a2 = cardsOf(after)[1];
    expect(restored.annotations[a2.id]).toEqual([{ ...note('ann_1', a2.id, 'remember this') }]);
    expect(Object.values(restored.annotations).flat()).toHaveLength(1);
    expect(Object.keys(restored.carry.notes)).toHaveLength(1);
  });

  it('ignores garbage and never pollutes prototypes from a tampered entry', () => {
    const { json } = baseDeck();
    const nb = open(json);
    for (const bad of [null, 7, 'x', [], { cards: 'no' }, { cards: { k: 5 } }]) {
      expect(fromStored(bad, nb).readerState).toEqual({});
    }
    const evil = JSON.parse('{"cards":{"__proto__":{"f0":{"polluted":true}}},"notes":{"__proto__":[]}}');
    const { readerState, carry } = fromStored(evil, nb);
    expect(readerState).toEqual({});
    expect(Object.keys(carry.cards)).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).f0).toBeUndefined();
  });

  it('drops malformed slot states and notes but keeps the valid ones', () => {
    const { json } = baseDeck();
    const nb = open(json);
    const keys = computeKeys(nb);
    const a = cardsOf(nb)[0];
    const ka = keys.cardKey.get(a.id)!;
    const stored = {
      cards: { [ka]: { f0: { selected: [0] }, f1: 'nope', f9: { value: 'orphan slot' } } },
      notes: { [ka]: [{ id: 'ann_ok', kind: 'note', body: 'ok', createdAt: 'x' }, { body: 3 }, 'junk'] },
    };
    const out = fromStored(stored, nb);
    expect(out.readerState[a.id]).toEqual({ [a.slots[0].id]: { selected: [0] } });
    expect(out.annotations[a.id].map((x) => x.body)).toEqual(['ok']);
  });
});

// ---------- load / save ----------

describe('loadProgress + createProgressStore', () => {
  const KEY = readerStorageKey('nb_author');

  function setup(storage: StorageLike, delay = 300) {
    const { json } = baseDeck();
    const nb = open(json);
    const initial = loadProgress(KEY, nb, storage);
    const onStatus = vi.fn();
    const store = createProgressStore({ key: KEY, notebook: nb, initial, storage, delay, onStatus, now: () => 1000 });
    return { json, nb, initial, store, onStatus };
  }

  it('restores saved progress on the next open (debounced save → sync load)', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const { json, nb, store } = setup(storage);
    const [a] = cardsOf(nb);
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'v1' } } }, {});
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'v2' } } }, {});
    expect(storage.getItem(KEY)).toBeNull(); // debounced
    vi.advanceTimersByTime(300);
    const saved = JSON.parse(storage.getItem(KEY)!);
    expect(saved.v).toBe(1);
    expect(saved.savedAt).toBe(1000);

    const reopened = open(json);
    const loaded = loadProgress(KEY, reopened, storage);
    const a2 = cardsOf(reopened)[0];
    expect(loaded.available).toBe(true);
    expect(loaded.readerState[a2.id][a2.slots[1].id]).toEqual({ value: 'v2' });
  });

  it('flush() writes the pending save immediately', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const { nb, store } = setup(storage, 10_000);
    const [a] = cardsOf(nb);
    store.schedule({ [a.id]: { [a.slots[0].id]: { selected: [0], submitted: true } } }, {});
    store.flush();
    expect(storage.getItem(KEY)).not.toBeNull();
  });

  it('never writes an entry for a student who has not interacted', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const { initial, store } = setup(storage);
    store.schedule(initial.readerState, initial.annotations);
    store.flush();
    expect(storage.length).toBe(0);
  });

  it('writes stale (carried) entries back so an author edit never destroys them', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 1, savedAt: 1, cards: { zzz: { f0: { value: 'old' } } }, notes: {} }));
    const { nb, store } = setup(storage);
    const [a] = cardsOf(nb);
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'new' } } }, {});
    store.flush();
    const saved = JSON.parse(storage.getItem(KEY)!);
    expect(saved.cards.zzz).toEqual({ f0: { value: 'old' } });
    expect(Object.keys(saved.cards)).toHaveLength(2);
  });

  it('two different files that share a docId (e.g. both derived from the demo) keep each other’s progress', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const docA = exportNotebook(authorNb([authorCard([input('only in A')])]));
    const docB = exportNotebook(authorNb([authorCard([input('only in B')])]));
    const work = (json: NotebookJSON, value: string) => {
      const nb = open(json);
      const initial = loadProgress(KEY, nb, storage);
      const store = createProgressStore({ key: KEY, notebook: nb, initial, storage });
      const [card] = cardsOf(nb);
      const prev = initial.readerState[card.id]?.[card.slots[0].id]?.value;
      store.schedule({ [card.id]: { [card.slots[0].id]: { value } } }, {});
      store.flush();
      return prev;
    };
    work(docA, 'answer A');
    work(docB, 'answer B');
    expect(work(docA, 'answer A2')).toBe('answer A');
    expect(work(docB, 'answer B2')).toBe('answer B');
  });

  it('stop() flushes what is pending and then ignores further saves (Remix / Import)', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const { nb, store } = setup(storage);
    const [a] = cardsOf(nb);
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'before remix' } } }, {});
    store.stop();
    const after = storage.getItem(KEY);
    expect(after).toContain('before remix');
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'after remix' } } }, {});
    vi.advanceTimersByTime(5000);
    store.flush();
    expect(storage.getItem(KEY)).toBe(after);
  });

  it('reset() removes the stored entry and cancels a pending save', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const { nb, store } = setup(storage);
    const [a] = cardsOf(nb);
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'x' } } }, {});
    store.flush();
    expect(storage.getItem(KEY)).not.toBeNull();
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'y' } } }, {});
    store.reset();
    vi.advanceTimersByTime(5000);
    expect(storage.getItem(KEY)).toBeNull();
    // the cleared in-memory state that follows a reset writes nothing
    store.schedule({}, {});
    store.flush();
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('survives storage that throws on every access', () => {
    vi.useFakeTimers();
    const storage = throwing();
    const { nb, initial, store, onStatus } = setup(storage);
    expect(initial.available).toBe(false);
    expect(initial.readerState).toEqual({});
    const [a] = cardsOf(nb);
    expect(() => {
      store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'x' } } }, {});
      store.flush();
      store.reset();
    }).not.toThrow();
    expect(onStatus).toHaveBeenCalledWith(false);
  });

  it('reports no storage when the localStorage getter itself throws', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    try {
      expect(safeLocalStorage()).toBeNull();
      const nb = open(baseDeck().json);
      expect(loadProgress(KEY, nb).available).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('a corrupt entry loads as empty but storage stays available', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, '{not json');
    const nb = open(baseDeck().json);
    const loaded = loadProgress(KEY, nb, storage);
    expect(loaded.available).toBe(true);
    expect(loaded.readerState).toEqual({});
  });

  it('on QuotaExceededError evicts the oldest reader entry (never foreign keys) and retries once', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage(600);
    const filler = (savedAt: number) => JSON.stringify({ v: 1, savedAt, cards: { k: { f0: { value: 'x'.repeat(120) } } } });
    storage.setItem('notebuilder:reader:v1:older', filler(5));
    storage.setItem('notebuilder:reader:v1:newer', filler(50));
    storage.setItem('some-other-app', 'y'.repeat(100));
    const { nb, store, onStatus } = setup(storage);
    const [a] = cardsOf(nb);
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'z'.repeat(40) } } }, {});
    store.flush();
    expect(storage.getItem(KEY)).not.toBeNull();
    expect(storage.getItem('notebuilder:reader:v1:older')).toBeNull();
    expect(storage.getItem('notebuilder:reader:v1:newer')).not.toBeNull();
    expect(storage.getItem('some-other-app')).not.toBeNull();
    expect(onStatus).toHaveBeenLastCalledWith(true);
  });

  it('gives up quietly (status false) when eviction cannot make room, without cascading', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage(400);
    const filler = (savedAt: number) => JSON.stringify({ v: 1, savedAt, cards: { k: { f0: { value: 'x'.repeat(60) } } } });
    storage.setItem('notebuilder:reader:v1:a', filler(1));
    storage.setItem('notebuilder:reader:v1:b', filler(2));
    const { nb, store, onStatus } = setup(storage);
    const [a] = cardsOf(nb);
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'w'.repeat(500) } } }, {});
    store.flush();
    expect(storage.getItem(KEY)).toBeNull();
    expect(onStatus).toHaveBeenLastCalledWith(false);
    const left = storage.length;
    store.schedule({ [a.id]: { [a.slots[1].id]: { value: 'w'.repeat(501) } } }, {});
    store.flush();
    expect(storage.length).toBe(left); // no second eviction after a failed retry
  });
});

describe('installFlushOnHide', () => {
  it('flushes on pagehide and on visibilitychange to hidden only', () => {
    const flush = vi.fn();
    const off = installFlushOnHide(flush);
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(1);

    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    vis.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(2);

    off();
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(2);
    vis.mockRestore();
  });
});
