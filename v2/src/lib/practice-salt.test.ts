import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import source from './practice-salt.ts?raw';

// Review fix (PR #1, F8): practice problems start from a per-reader seed. The salt behind it is
// created once per browser, read synchronously (mounting a problem must not wait or write state),
// and degrades to "no salt" — everyone's shared numbers, as before — where storage fails.

const KEY = 'notebuilder:practice-salt';

/** A fresh copy of the module, as a page reload would load it. */
async function load() {
  vi.resetModules();
  return import('./practice-salt');
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('practiceSalt', () => {
  it('creates a salt once, stores it, and returns the same one on every call', async () => {
    const { practiceSalt, PRACTICE_SALT_KEY } = await load();
    expect(PRACTICE_SALT_KEY).toBe(KEY);
    const salt = practiceSalt();
    expect(salt).toMatch(/^[0-9a-z]{8,64}$/i);
    expect(localStorage.getItem(KEY)).toBe(salt);
    expect(practiceSalt()).toBe(salt);
  });

  it('a reload reads the stored salt back instead of making a new one', async () => {
    const first = (await load()).practiceSalt();
    const set = vi.spyOn(Storage.prototype, 'setItem');
    expect((await load()).practiceSalt()).toBe(first);
    expect(set).not.toHaveBeenCalled();
  });

  it('two browsers (empty storages) get different salts', async () => {
    const a = (await load()).practiceSalt();
    localStorage.clear();
    const b = (await load()).practiceSalt();
    expect(a).not.toBe(b);
  });

  it('replaces a malformed stored value', async () => {
    localStorage.setItem(KEY, '<script>');
    const salt = (await load()).practiceSalt();
    expect(salt).toMatch(/^[0-9a-z]{8,64}$/i);
    expect(localStorage.getItem(KEY)).toBe(salt);
  });

  it('is null where storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect((await load()).practiceSalt()).toBeNull();
  });

  it('is null where the new salt cannot be stored (it would change on every reload)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { practiceSalt } = await load();
    expect(practiceSalt()).toBeNull();
    expect(practiceSalt()).toBeNull();
  });

  it('touches storage once per page load', async () => {
    const { practiceSalt } = await load();
    const get = vi.spyOn(Storage.prototype, 'getItem');
    practiceSalt();
    practiceSalt();
    practiceSalt();
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('hashString (32-bit FNV-1a)', () => {
  it('matches the reference vectors', async () => {
    const { hashString } = await load();
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('is an unsigned 32-bit integer', async () => {
    const { hashString } = await load();
    for (const s of ['x', 'salt:[1,2]', '日本語', 'a'.repeat(1000)]) {
      const h = hashString(s);
      expect(Number.isSafeInteger(h) && h >= 0 && h < 2 ** 32, s).toBe(true);
    }
  });
});

describe('practice-salt.ts stays a leaf', () => {
  it('imports nothing, so it can never pull anything into the Reader bundle', () => {
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
