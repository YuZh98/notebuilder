import { describe, it, expect } from 'vitest';
import { cyrb53 } from './hash';
import { contentHash } from './snapshots';
import { shareDocId } from './share';

// Pinned outputs of the hash as it shipped. Stored Reader progress is keyed by these strings and
// version history dedupes by them, so a change in a single character orphans a student's saved
// answers or every stored snapshot's identity: these vectors must never move.
describe('cyrb53', () => {
  it.each([
    ['', 0, 'wvjl67o803'],
    ['hello', 0, '19jqrdkps12'],
    ['hello', 1, '1w5qdiamkoz'],
    ['a', 0, '262p94epp1d'],
    ['The quick brown fox jumps over the lazy dog', 0, '1256xi6imlp'],
    ['é∑🙂', 0, '1ajxoa4cl9h'],
  ])('cyrb53(%j, %i) is %s', (text, seed, out) => {
    expect(cyrb53(text, seed)).toBe(out);
  });

  it('defaults the seed to 0', () => {
    expect(cyrb53('hello')).toBe(cyrb53('hello', 0));
  });

  it('is the one hash behind snapshot identity and the shared docId', () => {
    expect(contentHash({ id: 'nb', name: 'N', createdAt: 'c', updatedAt: 'u', sections: [] })).toBe('1k6l797wvsz');
    expect(shareDocId('inst-1234', 'nb_demo')).toBe(`d${cyrb53('inst-1234:nb_demo')}`);
    expect(shareDocId('inst-1234', 'nb_demo')).toBe('dpprn3sx6i6');
  });
});

describe('hash.ts', () => {
  it('imports nothing, so every caller can share it without pulling in another graph', async () => {
    const src = (await import('./hash.ts?raw')).default as string;
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
