import { debounce } from './debounce';

/**
 * Autosave orchestration (D0 durability): one debounced channel per persisted value (notebook,
 * reader state, factory state), all gated behind a hydration guard. NOTHING persists until the
 * startup load succeeded — otherwise the pre-hydration demo notebook / empty reader state could
 * overwrite what is stored. A failed hydration keeps persistence off for the whole session and
 * says so, instead of silently clobbering the user's data with whatever is in memory.
 */

export const HYDRATION_FAILED_MESSAGE =
  'Couldn’t load your saved notebooks — changes in this session won’t be saved.';

/** A save returns `false` (or rejects) on failure; anything else counts as success. */
export type SaveFn<T> = (value: T) => unknown;

export type AutosaveChannel<T> = {
  /** Debounced: persist `value` after the quiet period. Dropped while persistence is off. */
  schedule(value: T): void;
  /** Persist `value` now, superseding any pending scheduled value. Resolves when the save settled. */
  saveNow(value: T): Promise<void>;
  /** Run the pending scheduled save now (if any) and wait for every in-flight save. */
  flush(): Promise<void>;
  /** Drop the pending scheduled save. */
  cancel(): void;
  /** Storage already holds `value` (just hydrated/loaded) — an identical save is skipped. */
  prime(value: T): void;
};

export type Autosave = {
  channel<T>(name: string, save: SaveFn<T>, opts?: { fingerprint?: (value: T) => string }): AutosaveChannel<T>;
  /** Run the startup load; persistence turns on only if it resolves. Never rejects. */
  hydrate(load: () => Promise<void>): Promise<boolean>;
  /** Turn persistence on (hydration succeeded). Ignored after a failed hydration. */
  markHydrated(): void;
  /** True once hydration succeeded — the gate every persistent write checks. */
  readonly active: boolean;
  /** True when hydration threw: persistence stays off for this session. */
  readonly failed: boolean;
  /** Flush every channel and wait for all in-flight saves. Never rejects. */
  flushAll(): Promise<void>;
};

export type AutosaveOptions = {
  /** Debounce quiet period in ms (default 600). */
  wait?: number;
  /** User-facing error sink (App wires a toast). Defaults to console.error. */
  onError?: (message: string, err?: unknown) => void;
};

export function createAutosave(opts: AutosaveOptions = {}): Autosave {
  const wait = opts.wait ?? 600;
  const onError = opts.onError ?? ((m: string, e?: unknown) => console.error(m, e));
  let active = false;
  let failed = false;
  const flushers: Array<() => Promise<void>> = [];

  function channel<T>(
    name: string,
    save: SaveFn<T>,
    copts: { fingerprint?: (value: T) => string } = {},
  ): AutosaveChannel<T> {
    const fingerprint = copts.fingerprint ?? ((v: T) => JSON.stringify(v));
    // Fingerprint of what storage holds (or is about to hold): an identical save is a no-op.
    let stored: string | undefined;
    const inflight = new Set<Promise<void>>();

    function persist(value: T): Promise<void> {
      if (!active) return Promise.resolve();
      const fp = fingerprint(value);
      if (fp === stored) return Promise.resolve();
      stored = fp;
      const failedSave = (err?: unknown) => {
        // Forget the fingerprint so the next identical save retries instead of being skipped.
        if (stored === fp) stored = undefined;
        if (err !== undefined) onError(`Couldn’t save ${name} — ${errorText(err)}`, err);
      };
      const p = (async () => {
        try {
          if ((await save(value)) === false) failedSave();
        } catch (err) {
          failedSave(err);
        }
      })();
      inflight.add(p);
      void p.finally(() => inflight.delete(p));
      return p;
    }

    const debounced = debounce((value: T) => persist(value), wait);

    async function flush(): Promise<void> {
      await debounced.flush();
      await Promise.all([...inflight]);
    }

    flushers.push(flush);

    return {
      schedule(value) {
        if (active) debounced(value);
      },
      saveNow(value) {
        debounced.cancel();
        return persist(value);
      },
      flush,
      cancel: () => debounced.cancel(),
      prime(value) {
        stored = fingerprint(value);
      },
    };
  }

  function markHydrated(): void {
    if (!failed) active = true;
  }

  async function hydrate(load: () => Promise<void>): Promise<boolean> {
    try {
      await load();
    } catch (err) {
      failed = true;
      active = false;
      onError(HYDRATION_FAILED_MESSAGE, err);
      return false;
    }
    markHydrated();
    return active;
  }

  async function flushAll(): Promise<void> {
    await Promise.all(flushers.map((f) => f().catch(() => {})));
  }

  return {
    channel,
    hydrate,
    markHydrated,
    get active() {
      return active;
    },
    get failed() {
      return failed;
    },
    flushAll,
  };
}

/** Resolve with `p`'s value, or `undefined` after `ms` — never rejects. For close/quit paths. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
