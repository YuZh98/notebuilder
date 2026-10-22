import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInstallId, newInstallId, isInstallId, INSTALL_ID_PREF } from './install-id';

type Store = Record<string, string>;

function deps(store: Store, over: { persist?: boolean; getFails?: number; setFails?: number } = {}) {
  let ids = 0;
  let getFails = over.getFails ?? 0;
  let setFails = over.setFails ?? 0;
  const get = vi.fn(async (key: string) => {
    if (getFails > 0) {
      getFails--;
      throw new Error('database is locked');
    }
    return store[key] ?? null;
  });
  const set = vi.fn(async (key: string, value: string) => {
    if (setFails > 0) {
      setFails--;
      return false;
    }
    store[key] = value;
    return true;
  });
  const persist = { on: over.persist ?? true };
  const random = vi.fn(() => `install-${++ids}-0000`);
  return { get, set, random, persist, persistOn: () => persist.on };
}

describe('newInstallId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a random UUID where crypto.randomUUID exists', () => {
    const a = newInstallId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newInstallId()).not.toBe(a);
    expect(isInstallId(a)).toBe(true);
  });

  it('falls back to 128 random bits from getRandomValues (older WebKit, insecure contexts)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const a = newInstallId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newInstallId()).not.toBe(a);
    expect(isInstallId(a)).toBe(true);
  });
});

describe('isInstallId', () => {
  it('accepts sane tokens only', () => {
    expect(isInstallId('0b9c1c6e-6f1e-4b7e-9a51-1f0d6f2a9c11')).toBe(true);
    expect(isInstallId('')).toBe(false);
    expect(isInstallId('short')).toBe(false);
    expect(isInstallId('x'.repeat(65))).toBe(false);
    expect(isInstallId('has space in it')).toBe(false);
    expect(isInstallId(null)).toBe(false);
    expect(isInstallId(42)).toBe(false);
  });
});

describe('createInstallId', () => {
  it('outside storage (browser build): one random id per session, storage untouched', async () => {
    const d = deps({}, { persist: false });
    const getId = createInstallId(d);
    const a = await getId();
    expect(a).toBe('install-1-0000');
    expect(await getId()).toBe(a);
    expect(d.get).not.toHaveBeenCalled();
    expect(d.set).not.toHaveBeenCalled();
  });

  it('first use on an install: creates one id, stores it under install_id, and keeps returning it', async () => {
    const store: Store = {};
    const d = deps(store);
    const getId = createInstallId(d);
    const a = await getId();
    expect(store[INSTALL_ID_PREF]).toBe(a);
    expect(d.set).toHaveBeenCalledWith('install_id', a);
    expect(await getId()).toBe(a);
    expect(d.get).toHaveBeenCalledTimes(1);
    expect(d.set).toHaveBeenCalledTimes(1);
  });

  it('a later launch reads the stored id and writes nothing', async () => {
    const store: Store = { install_id: 'stored-id-1234' };
    const d = deps(store);
    expect(await createInstallId(d)()).toBe('stored-id-1234');
    expect(d.set).not.toHaveBeenCalled();
    expect(d.random).not.toHaveBeenCalled();
  });

  it('concurrent first calls share one read and one write', async () => {
    const store: Store = {};
    const d = deps(store);
    const getId = createInstallId(d);
    const [a, b] = await Promise.all([getId(), getId()]);
    expect(a).toBe(b);
    expect(d.get).toHaveBeenCalledTimes(1);
    expect(d.set).toHaveBeenCalledTimes(1);
  });

  it('a garbage stored value is replaced', async () => {
    const store: Store = { install_id: '' };
    const d = deps(store);
    const a = await createInstallId(d)();
    expect(a).toBe('install-1-0000');
    expect(store.install_id).toBe(a);
  });

  it('a failed read never overwrites the stored id: this call gets the session id, the next one retries', async () => {
    const store: Store = { install_id: 'stored-id-1234' };
    const d = deps(store, { getFails: 1 });
    const getId = createInstallId(d);
    expect(await getId()).toBe('install-1-0000');
    expect(d.set).not.toHaveBeenCalled();
    expect(await getId()).toBe('stored-id-1234');
  });

  it('a failed write keeps the id for the session and stores that same id on the next call', async () => {
    const store: Store = {};
    const d = deps(store, { setFails: 1 });
    const getId = createInstallId(d);
    const a = await getId();
    expect(store.install_id).toBeUndefined();
    expect(await getId()).toBe(a);
    expect(store.install_id).toBe(a);
  });

  it('an id handed out before storage opened is the one stored once it opens', async () => {
    const store: Store = {};
    const d = deps(store, { persist: false });
    const getId = createInstallId(d);
    const early = await getId();
    d.persist.on = true;
    expect(await getId()).toBe(early);
    expect(store.install_id).toBe(early);
  });
});
