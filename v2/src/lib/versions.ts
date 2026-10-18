/**
 * Version keeper (D0, W7): decides WHEN a notebook gets a snapshot, on top of the pure policy in
 * snapshots.ts and the storage in db.ts (both injected, so this is testable without either).
 *
 * - After every successful notebook save, an automatic snapshot is taken when the policy says so
 *   (none yet, or the newest is ≥ 10 min old AND the content differs).
 * - When a notebook is opened from storage, the same rule runs on what was stored: a notebook
 *   edited after its newest version (e.g. the end of yesterday's session) gets that state kept
 *   before today's edits begin.
 * - Explicit versions (manual, before-restore) are always taken.
 *
 * It remembers the newest snapshot per notebook (time + content hash), learned once from the
 * stored list and then kept current by every snapshot it takes — so the decision after a save is
 * synchronous, never waits on a read, and the snapshot is queued before a close flush settles.
 */
import {
  autoWindowElapsed,
  contentHash,
  shouldAutoSnapshot,
  type SnapshotMeta,
  type SnapshotReason,
} from './snapshots';
import type { Notebook } from './types';

export type VersionKeeperDeps = {
  /** The notebook's stored versions, newest first (db.listSnapshots). May reject. */
  list(notebookId: string): Promise<SnapshotMeta[]>;
  /** Store a version taken at `at` (db.saveSnapshot). Resolves false on failure. */
  save(nb: Notebook, reason: SnapshotReason, at: number): Promise<boolean>;
  /** May anything be read or stored right now (Tauri, and hydration succeeded)? */
  enabled(): boolean;
  /** A fresh list of `notebookId`'s versions arrived — the panel shows the open notebook's. */
  onlist?(notebookId: string, list: SnapshotMeta[]): void;
  now?(): number;
};

export type VersionKeeper = {
  /** A notebook was opened: list its versions; when it came from storage, apply the auto rule to it. */
  opened(nb: Notebook, fromStorage: boolean): Promise<void>;
  /** `nb` was just saved successfully: take an automatic version if one is due. True when taken. */
  saved(nb: Notebook): Promise<boolean>;
  /** Take a version now, whatever the rate limit (manual, before-restore). True when stored. */
  take(nb: Notebook, reason: SnapshotReason): Promise<boolean>;
  /** Re-read a notebook's versions (resolves null when they could not be read). */
  refresh(notebookId: string): Promise<SnapshotMeta[] | null>;
  /** The notebook was deleted: forget its newest version. */
  forget(notebookId: string): void;
};

type Newest = Pick<SnapshotMeta, 'createdAt' | 'hash'> | null;

export function createVersionKeeper(deps: VersionKeeperDeps): VersionKeeper {
  const clock = deps.now ?? (() => Date.now());
  // notebook id → its newest snapshot (null: it has none). Absent: not learned yet.
  const newest = new Map<string, Newest>();

  async function refresh(notebookId: string): Promise<SnapshotMeta[] | null> {
    if (!deps.enabled()) return null;
    let list: SnapshotMeta[];
    try {
      list = await deps.list(notebookId);
    } catch (err) {
      // Not fatal: no automatic version now; the next save tries again.
      console.warn('could not list versions', err);
      return null;
    }
    // Learned once; after that record() keeps it current — a list read that was queued before a
    // snapshot write must not roll it back.
    if (!newest.has(notebookId)) {
      newest.set(notebookId, list[0] ? { createdAt: list[0].createdAt, hash: list[0].hash } : null);
    }
    deps.onlist?.(notebookId, list);
    return list;
  }

  function record(nb: Notebook, reason: SnapshotReason, at: number, hash: string): Promise<boolean> {
    const known = newest.has(nb.id);
    const prev = newest.get(nb.id) ?? null;
    const mark: Newest = { createdAt: new Date(at).toISOString(), hash };
    newest.set(nb.id, mark);
    const undo = () => {
      // A failed write must not rate-limit the next save: forget the optimistic mark.
      if (newest.get(nb.id) !== mark) return;
      if (known) newest.set(nb.id, prev);
      else newest.delete(nb.id);
    };
    let saving: Promise<boolean>;
    try {
      saving = deps.save(nb, reason, at);
    } catch (err) {
      console.warn('version not stored', err);
      undo();
      return Promise.resolve(false);
    }
    return saving.then(
      (ok) => {
        if (!ok) {
          undo();
          return false;
        }
        void refresh(nb.id);
        return true;
      },
      () => {
        undo();
        return false;
      },
    );
  }

  function decide(nb: Notebook): Promise<boolean> {
    const last = newest.get(nb.id) ?? null;
    const now = clock();
    // Inside the window there is nothing to hash: most saves stop here.
    if (last && !autoWindowElapsed(last.createdAt, now)) return Promise.resolve(false);
    const hash = contentHash(nb);
    if (!shouldAutoSnapshot({ last, now, hash })) return Promise.resolve(false);
    return record(nb, 'auto', now, hash);
  }

  function saved(nb: Notebook): Promise<boolean> {
    // Called from inside the notebook save: whatever happens here must not fail that save.
    try {
      if (!deps.enabled()) return Promise.resolve(false);
      if (newest.has(nb.id)) return decide(nb);
      return refresh(nb.id).then(() => (newest.has(nb.id) && deps.enabled() ? decide(nb) : false));
    } catch (err) {
      console.warn('automatic version skipped', err);
      return Promise.resolve(false);
    }
  }

  async function opened(nb: Notebook, fromStorage: boolean): Promise<void> {
    if (!deps.enabled()) return;
    await refresh(nb.id);
    if (fromStorage && newest.has(nb.id) && deps.enabled()) await decide(nb);
  }

  function take(nb: Notebook, reason: SnapshotReason): Promise<boolean> {
    if (!deps.enabled()) return Promise.resolve(false);
    return record(nb, reason, clock(), contentHash(nb));
  }

  return {
    opened,
    saved,
    take,
    refresh,
    forget: (notebookId) => void newest.delete(notebookId),
  };
}
