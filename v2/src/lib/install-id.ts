/**
 * This install's random identity. A shared file namespaces each student's saved progress by its
 * docId; the notebook id alone is not unique across installs (every install's first notebook is
 * the demo, 'nb_demo'), and Chrome gives every file:// page one localStorage — so two teachers'
 * files would share, and reset, one student's progress. share.ts's shareDocId prefixes this id.
 */

/** Preference key the id is stored under (app-wide, created once per install). */
export const INSTALL_ID_PREF = 'install_id';

/** A stored value we accept as an install id: a plain token of sane length. */
export function isInstallId(v: unknown): v is string {
  return typeof v === 'string' && /^[\w-]{8,64}$/.test(v);
}

/** A fresh random id: crypto.randomUUID where it exists, else 128 bits from getRandomValues. */
export function newInstallId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  if (typeof c?.getRandomValues === 'function') {
    return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // No Web Crypto at all (never expected in a supported webview): still unique enough per install.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export type InstallIdDeps = {
  /** May storage be read and written right now? (App: inside Tauri, after hydration.) */
  persistOn: () => boolean;
  /** Queued preference read; may reject. */
  get: (key: string) => Promise<string | null>;
  /** Queued preference write; resolves false when it could not be stored. */
  set: (key: string, value: string) => Promise<boolean>;
  random?: () => string;
};

/**
 * getInstallId(): the stored id, created and stored on first use. Where nothing can be stored
 * (the browser build, before hydration, failed hydration) it is a per-session random id — and
 * that same id is the one stored once storage opens with none there. A failed read never
 * overwrites the stored id; a failed read or write is retried on the next call. Never rejects.
 */
export function createInstallId(deps: InstallIdDeps): () => Promise<string> {
  const random = deps.random ?? newInstallId;
  let session: string | null = null;
  let known: string | null = null;
  let pending: Promise<string> | null = null;
  const sessionId = (): string => (session ??= random());

  async function fromStorage(): Promise<string> {
    try {
      const found = await deps.get(INSTALL_ID_PREF);
      if (isInstallId(found)) return (known = found);
      const id = sessionId();
      if (await deps.set(INSTALL_ID_PREF, id)) known = id;
      return id;
    } catch {
      return sessionId();
    }
  }

  return () => {
    if (known) return Promise.resolve(known);
    if (!deps.persistOn()) return Promise.resolve(sessionId());
    // One read (and at most one write) however many shares start at once.
    pending ??= fromStorage().finally(() => {
      pending = null;
    });
    return pending;
  };
}
