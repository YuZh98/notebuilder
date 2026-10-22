/**
 * A random salt per browser for practice problems' first numbers. A problem slot that has never
 * asked for new numbers starts from a seed hashed from this salt and the problem itself
 * (problem.ts baseSeed), so students in one class do not all see the same numbers in the same
 * order, while each one sees the same numbers on every reload — and mounting writes no reader
 * state. Device-local like reader progress: never exported, never shared.
 *
 * Read synchronously, created once. Where storage cannot be read, or a new salt cannot be kept,
 * there is no salt (null) and problems fall back to the shared DEFAULT_SEED: a salt that changed
 * on every reload would change a student's numbers under them.
 *
 * Imports nothing, so the Reader bundle can carry it without pulling anything else in.
 */

export const PRACTICE_SALT_KEY = 'notebuilder:practice-salt';

const SALT_RE = /^[0-9a-z]{8,64}$/i;

let salt: string | null | undefined;

function newSalt(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.getRandomValues === 'function') {
    return Array.from(c.getRandomValues(new Uint32Array(2)), (n) => n.toString(36).padStart(7, '0')).join('');
  }
  return `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`.padEnd(8, '0');
}

/** This browser's practice salt, or null where storage cannot hold one. Cached per page load. */
export function practiceSalt(): string | null {
  if (salt !== undefined) return salt;
  try {
    const store = globalThis.localStorage;
    const found = store.getItem(PRACTICE_SALT_KEY);
    if (found !== null && SALT_RE.test(found)) return (salt = found);
    const made = newSalt();
    store.setItem(PRACTICE_SALT_KEY, made);
    return (salt = made);
  } catch {
    return (salt = null);
  }
}

/** 32-bit FNV-1a over UTF-16 code units: a small, stable, non-cryptographic string hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
