import { describe, it, expect, beforeEach } from 'vitest';
import { session, shuffleSection, clearShuffle, studyOrder, resetSession } from './session.svelte';
import type { Section, Card } from './types';

function card(id: string): Card {
  return { id, sectionId: 's1', position: 0, slots: [] };
}

function section(cards: Card[]): Section {
  return { id: 's1', notebookId: 'nb1', name: 'S', position: 0, cards };
}

beforeEach(() => resetSession());

describe('shuffleSection', () => {
  it('stores a permutation of the section card ids', () => {
    const s = section([card('a'), card('b'), card('c'), card('d')]);
    shuffleSection(s);
    const order = session.shuf['s1'];
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('studyOrder follows the stored shuffle', () => {
    const s = section([card('a'), card('b'), card('c')]);
    session.shuf['s1'] = ['c', 'a', 'b'];
    expect(studyOrder(s).map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('studyOrder without a shuffle', () => {
  it('returns stored card order', () => {
    const s = section([card('a'), card('b')]);
    expect(studyOrder(s).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('clearShuffle', () => {
  it('drops the shuffle so studyOrder reverts to stored order', () => {
    const s = section([card('a'), card('b')]);
    session.shuf['s1'] = ['b', 'a'];
    clearShuffle('s1');
    expect(session.shuf['s1']).toBeUndefined();
    expect(studyOrder(s).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('resetSession', () => {
  it('wipes all four maps', () => {
    session.shuf['s1'] = ['a'];
    session.search['s1'] = 'q';
    session.showArch['s1'] = true;
    session.live['c1'] = { rate: 80 };
    resetSession();
    expect(session.shuf).toEqual({});
    expect(session.search).toEqual({});
    expect(session.showArch).toEqual({});
    expect(session.live).toEqual({});
  });
});

describe('session.live (v1 LIVE layer)', () => {
  it('holds per-card scope values keyed by variable name', () => {
    session.live['c1'] = { rate: 80 };
    expect(session.live['c1'].rate).toBe(80);
  });
});
