/**
 * Version history policy (D0): pure rules for the local `snapshots` table — when an automatic
 * snapshot is due, which snapshots retention drops, and how a restored snapshot becomes the
 * open notebook again. No I/O here: db.ts stores snapshots, versions.ts decides when to take
 * them, App.svelte wires both.
 *
 * A snapshot's data is the lossless JSON of the notebook as it was in memory, so its card ids
 * are the ids reader_state rows are keyed by: restoring keeps the student-progress layer valid.
 */
import { derivedTagUnion } from './tags';
import type { Notebook } from './types';

export type SnapshotReason = 'auto' | 'manual' | 'before-restore';

/** One stored version as listed (its data stays in SQLite until a restore loads it). */
export type SnapshotMeta = {
  id: string;
  /** ISO 8601 (UTC) — sorts chronologically as text. */
  createdAt: string;
  reason: SnapshotReason | string;
  cardCount: number;
  /** contentHash of the stored notebook — the auto-snapshot hash gate after a restart. */
  hash: string;
};

/** What retention needs to know about a snapshot. */
export type SnapshotStamp = Pick<SnapshotMeta, 'id' | 'createdAt' | 'reason'>;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Automatic snapshots are at least this far apart. */
export const AUTO_SNAPSHOT_EVERY_MS = 10 * MIN;
/** Everything from the last RECENT_WINDOW_MS is kept, up to the RECENT_KEEP newest. */
export const RECENT_WINDOW_MS = DAY;
export const RECENT_KEEP = 50;
/** Older than that, one per calendar day (the day's newest) is kept for DAILY_WINDOW_MS. */
export const DAILY_WINDOW_MS = 30 * DAY;
/** The MANUAL_KEEP newest manual snapshots are kept whatever their age. */
export const MANUAL_KEEP = 20;

// ---------------------------------------------------------------------------------------------
// Content identity
// ---------------------------------------------------------------------------------------------

/**
 * cyrb53 (public-domain 53-bit string hash), base36. Not cryptographic — identity only.
 * The same function as reader-store's; a local copy keeps db.ts (which hashes every snapshot it
 * stores) off reader-store's import graph (json-io and the whole slot registry).
 */
function cyrb53(str: string, seed = 0): string {
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

/** JSON with object keys sorted at every depth, so equal content always serializes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined || typeof v === 'function' ? 'null' : stableStringify(v))).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Hash of the notebook's content — everything except updatedAt, which every save restamps. */
export function contentHash(nb: Notebook): string {
  return cyrb53(stableStringify({ ...nb, updatedAt: undefined }));
}

// ---------------------------------------------------------------------------------------------
// When to snapshot
// ---------------------------------------------------------------------------------------------

/**
 * Is the newest snapshot (taken at `createdAt`) out of the rate-limit window at `now`? A clock
 * that moved back by more than the window does not freeze snapshots until it catches up, and an
 * unreadable timestamp counts as old.
 */
export function autoWindowElapsed(createdAt: string, now: number): boolean {
  const elapsed = now - Date.parse(createdAt);
  return !(Math.abs(elapsed) < AUTO_SNAPSHOT_EVERY_MS);
}

/**
 * After a save: take an automatic snapshot? Yes when the notebook has none yet, or when the
 * newest is at least AUTO_SNAPSHOT_EVERY_MS old AND the content differs from it.
 */
export function shouldAutoSnapshot({
  last,
  now,
  hash,
}: {
  last: Pick<SnapshotMeta, 'createdAt' | 'hash'> | null;
  now: number;
  hash: string;
}): boolean {
  if (!last) return true;
  return autoWindowElapsed(last.createdAt, now) && last.hash !== hash;
}

// ---------------------------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------------------------

function localDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Ids retention deletes from one notebook's snapshots at `now`:
 * 1. the MANUAL_KEEP newest manual snapshots are kept, whatever their age;
 * 2. of the rest, everything from the last 24h is kept, up to the RECENT_KEEP newest;
 * 3. of what is left and younger than 30 days, the newest of each local calendar day is kept —
 *    so a busy today can never push out the last version of yesterday;
 * 4. everything else goes. A snapshot whose timestamp cannot be read is never deleted.
 */
export function pruneIds(snapshots: readonly SnapshotStamp[], now: number): string[] {
  const dated = snapshots
    .map((s) => ({ id: s.id, reason: s.reason, t: Date.parse(s.createdAt) }))
    .filter((d) => Number.isFinite(d.t))
    // newest first; equal times fall back to the id so the outcome never depends on input order
    .sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const keep = new Set<string>();
  let manual = 0;
  for (const d of dated) {
    if (d.reason === 'manual' && manual < MANUAL_KEEP) {
      keep.add(d.id);
      manual++;
    }
  }
  let recent = 0;
  for (const d of dated) {
    if (keep.has(d.id) || recent >= RECENT_KEEP) continue;
    if (now - d.t < RECENT_WINDOW_MS) {
      keep.add(d.id);
      recent++;
    }
  }
  const days = new Set<string>();
  for (const d of dated) {
    if (keep.has(d.id) || now - d.t >= DAILY_WINDOW_MS) continue;
    const day = localDay(d.t);
    if (!days.has(day)) {
      days.add(day);
      keep.add(d.id);
    }
  }
  return dated.filter((d) => !keep.has(d.id)).map((d) => d.id);
}

// ---------------------------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------------------------

/**
 * The notebook a restore puts in place of `current`: the snapshot's content (sections, cards,
 * tags, subtitle, name — renamed like a name edit) under the CURRENT id and creation time, with
 * every section re-homed on that id. A blank stored name keeps the current one.
 */
export function restoredNotebook(snapshot: Notebook, current: Notebook): Notebook {
  const name = typeof snapshot.name === 'string' ? snapshot.name.trim() : '';
  const nb: Notebook = {
    ...snapshot,
    id: current.id,
    name: name || current.name,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    sections: snapshot.sections.map((s) => ({ ...s, notebookId: current.id })),
  };
  if (!Array.isArray(nb.cats)) nb.cats = derivedTagUnion(nb);
  return nb;
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a short local date. */
export function relativeTime(createdAt: string, now: number): string {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return createdAt;
  const elapsed = now - t;
  if (elapsed < MIN) return 'just now';
  const mins = Math.floor(elapsed / MIN);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const a = new Date(t);
  const b = new Date(now);
  const days = Math.max(
    1,
    Math.round(
      (new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
        new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) /
        DAY,
    ),
  );
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return a.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(a.getFullYear() !== b.getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

const REASON_LABELS: Record<string, string> = {
  auto: 'Auto-saved',
  manual: 'Saved by you',
  'before-restore': 'Before a restore',
};

export function reasonLabel(reason: string): string {
  return Object.prototype.hasOwnProperty.call(REASON_LABELS, reason) ? REASON_LABELS[reason] : reason;
}
