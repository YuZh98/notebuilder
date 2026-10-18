/**
 * Shared-Reader progress persistence (D1a). A student opens a shared .html offline, works, closes,
 * reopens — and their progress is back. The layer is the reader/progress one: it persists in this
 * browser's localStorage only and never enters an export or a share payload.
 *
 * importNotebook regenerates every id on each load, so ids can't key anything that must survive a
 * reload. Instead each card is keyed by a hash of its exported (interchange) JSON — plus an ordinal
 * for identical duplicates — and each slot by face + index (`f0`, `b1`). Editing a card's content
 * changes its key, which drops (carries, never deletes) only that card's progress; adding, removing
 * or moving other cards leaves the rest intact. Card keys are computed once from the pristine
 * notebook at open, so in-session document toggles (pin, archive) never shift them.
 */
import { CARD_STATE_KEY } from './card-done';
import { exportNotebook } from './json-io';
import { stripPresentation } from './presentation';
import { uid } from './uid';
import type { AnnotationMap } from './annotations';
import type { ReaderStateMap } from './db';
import type { Annotation, Notebook } from './types';

export type { ReaderStateMap };

/** Every Reader entry starts with this; eviction only ever touches keys under it. */
export const READER_PREFIX = 'notebuilder:reader:';
const NAMESPACE = `${READER_PREFIX}v1:`;
const PROBE_KEY = 'notebuilder:probe';
const STORED_VERSION = 1;
const DEFAULT_DELAY = 500;
const STABLE_KEY_RE = /^[0-9a-z]+(?:\.\d+)?$/;

/** The subset of the Web Storage API this module touches (injectable for tests). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export type StoredNote = Pick<Annotation, 'id' | 'kind' | 'body' | 'createdAt'>;
/** stable card key → slot key (`f0` / `b0` / `__card__`) → slot state. */
export type StoredCards = Record<string, Record<string, Record<string, unknown>>>;
export type StoredBody = { cards: StoredCards; notes: Record<string, StoredNote[]> };

export type ReaderKeys = {
  /** card id → stable card key */
  cardKey: Map<string, string>;
  /** stable card key → card id */
  cardId: Map<string, string>;
  /** card id → (slot id → slot key) */
  slotKey: Map<string, Map<string, string>>;
  /** card id → (slot key → slot id) */
  slotId: Map<string, Map<string, string>>;
};

export type LoadedProgress = {
  readerState: ReaderStateMap;
  annotations: AnnotationMap;
  /** Stored entries this notebook has no card for (author edited/removed it) — written back untouched. */
  carry?: StoredBody;
  /** False when localStorage is unreachable or refuses writes; the Reader then says so quietly. */
  available?: boolean;
};

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const emptyBody = (): StoredBody => ({ cards: {}, notes: {} });

/** cyrb53 (public-domain 53-bit string hash), base36. Not cryptographic — identity only. */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The document identity a Reader namespaces by: the payload docId, else a hash of the payload. */
export function readerDocRef(docId: string | undefined, payloadRaw: string): string {
  return docId || cyrb53(payloadRaw);
}

export function readerStorageKey(docRef: string): string {
  return NAMESPACE + docRef;
}

/** Map this load's card/slot ids ↔ reload-stable keys (see the module comment). */
export function computeKeys(notebook: Notebook): ReaderKeys {
  const keys: ReaderKeys = { cardKey: new Map(), cardId: new Map(), slotKey: new Map(), slotId: new Map() };
  const exported = exportNotebook(notebook).notebook.sections;
  const seen = new Map<string, number>();
  notebook.sections.forEach((section, si) => {
    section.cards.forEach((card, ci) => {
      const hash = cyrb53(JSON.stringify(exported[si].cards[ci]));
      const dup = seen.get(hash) ?? 0;
      seen.set(hash, dup + 1);
      const key = dup === 0 ? hash : `${hash}.${dup}`;
      keys.cardKey.set(card.id, key);
      keys.cardId.set(key, card.id);
      const toKey = new Map<string, string>([[CARD_STATE_KEY, CARD_STATE_KEY]]);
      const toId = new Map<string, string>([[CARD_STATE_KEY, CARD_STATE_KEY]]);
      const faces: [string, typeof card.slots][] = [['f', card.slots], ['b', card.back ?? []]];
      for (const [face, slots] of faces) {
        slots.forEach((s, k) => {
          toKey.set(s.id, `${face}${k}`);
          toId.set(`${face}${k}`, s.id);
        });
      }
      keys.slotKey.set(card.id, toKey);
      keys.slotId.set(card.id, toId);
    });
  });
  return keys;
}

const keysOf = (src: Notebook | ReaderKeys): ReaderKeys => ('cardKey' in src ? src : computeKeys(src));

/** Rekey in-memory progress (and annotations) by stable keys, stripping volatile presentation. */
export function toStored(
  readerState: ReaderStateMap,
  notebook: Notebook | ReaderKeys,
  annotations: AnnotationMap = {},
): StoredBody {
  const keys = keysOf(notebook);
  const body = emptyBody();
  const state = stripPresentation(readerState);
  for (const cardId of Object.keys(state)) {
    const cardKey = keys.cardKey.get(cardId);
    const slotKeys = keys.slotKey.get(cardId);
    if (!cardKey || !slotKeys) continue;
    const out: Record<string, Record<string, unknown>> = {};
    for (const slotId of Object.keys(state[cardId])) {
      const slotKey = slotKeys.get(slotId);
      if (slotKey && isRecord(state[cardId][slotId])) out[slotKey] = state[cardId][slotId];
    }
    if (Object.keys(out).length > 0) body.cards[cardKey] = out;
  }
  for (const cardId of Object.keys(annotations)) {
    const cardKey = keys.cardKey.get(cardId);
    const list = annotations[cardId];
    if (!cardKey || !list?.length) continue;
    body.notes[cardKey] = list.map(({ id, kind, body: text, createdAt }) => ({ id, kind, body: text, createdAt }));
  }
  return body;
}

function readNote(v: unknown): StoredNote | null {
  if (!isRecord(v) || typeof v.body !== 'string') return null;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : uid('ann'),
    kind: v.kind === 'highlight' ? 'highlight' : 'note',
    body: v.body,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
  };
}

/**
 * Map a stored body back onto this load's ids. Entries whose stable key matches no card (the author
 * edited or removed that card) come back as `carry`; malformed entries are dropped.
 */
export function fromStored(
  stored: unknown,
  notebook: Notebook | ReaderKeys,
): { readerState: ReaderStateMap; annotations: AnnotationMap; carry: StoredBody } {
  const keys = keysOf(notebook);
  const readerState: ReaderStateMap = {};
  const annotations: AnnotationMap = {};
  const carry = emptyBody();
  if (!isRecord(stored)) return { readerState, annotations, carry };

  const cards = isRecord(stored.cards) ? stored.cards : {};
  for (const cardKey of Object.keys(cards)) {
    const entry = cards[cardKey];
    if (!isRecord(entry)) continue;
    const cardId = keys.cardId.get(cardKey);
    if (cardId === undefined) {
      if (STABLE_KEY_RE.test(cardKey)) carry.cards[cardKey] = entry as StoredCards[string];
      continue;
    }
    const slotIds = keys.slotId.get(cardId)!;
    const out: Record<string, Record<string, unknown>> = {};
    for (const slotKey of Object.keys(entry)) {
      const slotId = slotIds.get(slotKey);
      const value = entry[slotKey];
      if (slotId !== undefined && isRecord(value)) out[slotId] = value;
    }
    if (Object.keys(out).length > 0) readerState[cardId] = out;
  }

  const notes = isRecord(stored.notes) ? stored.notes : {};
  for (const cardKey of Object.keys(notes)) {
    const raw = notes[cardKey];
    if (!Array.isArray(raw)) continue;
    const list = raw.map(readNote).filter((x): x is StoredNote => x !== null);
    if (list.length === 0) continue;
    const cardId = keys.cardId.get(cardKey);
    if (cardId === undefined) {
      if (STABLE_KEY_RE.test(cardKey)) carry.notes[cardKey] = list;
      continue;
    }
    annotations[cardId] = list.map((n) => ({ ...n, cardId }));
  }
  return { readerState, annotations, carry };
}

/** window.localStorage, or null where touching it throws (blocked storage, sandboxed frames). */
export function safeLocalStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? (window.localStorage ?? null) : null;
  } catch {
    return null;
  }
}

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}

/** True when a write can be attempted. A full quota still counts — saving evicts to make room. */
function probe(storage: StorageLike): boolean {
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch (e) {
    return isQuotaError(e);
  }
}

/** Synchronous load, run before the Reader mounts. Never throws. */
export function loadProgress(
  key: string,
  notebook: Notebook,
  storage: StorageLike | null = safeLocalStorage(),
): LoadedProgress {
  const empty = (available: boolean): LoadedProgress => ({ readerState: {}, annotations: {}, carry: emptyBody(), available });
  if (!storage || !probe(storage)) return empty(false);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return empty(false);
  }
  if (raw === null) return empty(true);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty(true);
  }
  if (!isRecord(parsed) || parsed.v !== STORED_VERSION) return empty(true);
  return { ...fromStored(parsed, notebook), available: true };
}

/** Remove the least-recently-saved Reader entry other than `keep`. False when there is none. */
function evictOldest(storage: StorageLike, keep: string): boolean {
  let oldest: string | null = null;
  let oldestAt = Infinity;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || k === keep || !k.startsWith(READER_PREFIX)) continue;
      let at = 0;
      try {
        const v = JSON.parse(storage.getItem(k) ?? '');
        if (isRecord(v) && typeof v.savedAt === 'number') at = v.savedAt;
      } catch {
        // unreadable entries are the first to go
      }
      if (at < oldestAt) {
        oldestAt = at;
        oldest = k;
      }
    }
    if (oldest === null) return false;
    storage.removeItem(oldest);
    return true;
  } catch {
    return false;
  }
}

export type ProgressStore = {
  /** Queue a debounced save of the latest in-memory progress. */
  schedule(readerState: ReaderStateMap, annotations: AnnotationMap): void;
  /** Write any pending save now (pagehide, tab hidden, unmount). */
  flush(): void;
  /** Forget everything stored for this document and cancel any pending save. */
  reset(): void;
  /** Flush, then ignore all further saves — the document diverged (Remix / Import). */
  stop(): void;
};

export function createProgressStore(opts: {
  key: string;
  /** The pristine notebook as opened — keys are fixed from it for the whole session. */
  notebook: Notebook;
  initial?: LoadedProgress;
  storage?: StorageLike | null;
  delay?: number;
  /** Called after every write attempt: false = this browser isn't keeping progress. */
  onStatus?: (ok: boolean) => void;
  now?: () => number;
}): ProgressStore {
  const { key } = opts;
  const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  const delay = opts.delay ?? DEFAULT_DELAY;
  const now = opts.now ?? Date.now;
  const keys = computeKeys(opts.notebook);
  let carry: StoredBody = opts.initial?.carry ?? emptyBody();
  let pending: { state: ReaderStateMap; notes: AnnotationMap } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let evictionSpent = false;

  const bodyOf = (state: ReaderStateMap, notes: AnnotationMap): StoredBody => {
    const cur = toStored(state, keys, notes);
    return { cards: { ...carry.cards, ...cur.cards }, notes: { ...carry.notes, ...cur.notes } };
  };
  // Signature of what storage holds now: an unchanged body is never rewritten (and savedAt,
  // the eviction clock, only moves when progress actually changed).
  let lastSig = JSON.stringify(bodyOf(opts.initial?.readerState ?? {}, opts.initial?.annotations ?? {}));

  const report = (ok: boolean) => opts.onStatus?.(ok);

  function setWithEviction(text: string): boolean {
    try {
      storage!.setItem(key, text);
      return true;
    } catch (e) {
      // One eviction + one retry per write; once that fails, stop evicting other documents.
      if (!isQuotaError(e) || evictionSpent) return false;
      if (!evictOldest(storage!, key)) {
        evictionSpent = true;
        return false;
      }
      try {
        storage!.setItem(key, text);
        return true;
      } catch {
        evictionSpent = true;
        return false;
      }
    }
  }

  function write() {
    timer = undefined;
    if (!pending) return;
    const body = bodyOf(pending.state, pending.notes);
    pending = null;
    const sig = JSON.stringify(body);
    if (sig === lastSig) return;
    if (!storage) return report(false);
    const empty = Object.keys(body.cards).length === 0 && Object.keys(body.notes).length === 0;
    let ok: boolean;
    if (empty) {
      try {
        storage.removeItem(key);
        ok = true;
      } catch {
        ok = false;
      }
    } else {
      ok = setWithEviction(JSON.stringify({ v: STORED_VERSION, savedAt: now(), ...body }));
    }
    if (ok) lastSig = sig;
    report(ok);
  }

  function cancel() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function flush() {
    if (stopped || timer === undefined) return;
    cancel();
    write();
  }

  return {
    schedule(state, notes) {
      if (stopped) return;
      pending = { state, notes };
      cancel();
      timer = setTimeout(write, delay);
    },
    flush,
    reset() {
      cancel();
      pending = null;
      carry = emptyBody();
      lastSig = JSON.stringify(emptyBody());
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        report(false);
      }
    },
    stop() {
      flush();
      stopped = true;
    },
  };
}

/** Flush on the last reliable moments before a tab/file closes. Returns the unbinder. */
export function installFlushOnHide(flush: () => void, win: Window = window, doc: Document = document): () => void {
  const onHide = () => flush();
  const onVis = () => {
    if (doc.visibilityState === 'hidden') flush();
  };
  win.addEventListener('pagehide', onHide);
  doc.addEventListener('visibilitychange', onVis);
  return () => {
    win.removeEventListener('pagehide', onHide);
    doc.removeEventListener('visibilitychange', onVis);
  };
}
