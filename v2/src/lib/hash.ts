/**
 * cyrb53 (public-domain 53-bit string hash), base36. Not cryptographic — identity only.
 *
 * The one copy, with no imports on purpose: snapshots.ts (and through it db.ts), reader-store.ts
 * (the Reader) and share.ts all hash with it, and none of them should drag another's import graph
 * along to do so. Its outputs are persisted (Reader progress keys, snapshot identity, shared
 * docIds), so they must never change — hash.test.ts pins them.
 */
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
