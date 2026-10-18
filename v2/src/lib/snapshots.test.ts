import { describe, it, expect } from 'vitest';
import {
  AUTO_SNAPSHOT_EVERY_MS,
  MANUAL_KEEP,
  RECENT_KEEP,
  contentHash,
  stableStringify,
  shouldAutoSnapshot,
  pruneIds,
  restoredNotebook,
  relativeTime,
  reasonLabel,
  type SnapshotStamp,
} from './snapshots';
import type { Notebook } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Local wall-clock times, so the calendar-day rules hold whatever TZ the suite runs in.
const NOW = new Date(2026, 9, 18, 15, 0, 0).getTime(); // Sun 18 Oct 2026, 15:00 local
const iso = (t: number) => new Date(t).toISOString();
const ago = (ms: number) => iso(NOW - ms);
const local = (d: number, h: number, m = 0) => iso(new Date(2026, 9, d, h, m).getTime());

const nb = (over: Partial<Notebook> = {}): Notebook => ({
  id: 'nb1',
  name: 'Physics',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  cats: ['a'],
  sections: [
    {
      id: 's1',
      notebookId: 'nb1',
      name: 'Kinematics',
      position: 0,
      cards: [
        { id: 'c1', sectionId: 's1', position: 0, tags: ['a'], slots: [{ id: 'x', type: 'text', props: { text: 'v = d/t' } }] },
        { id: 'c2', sectionId: 's1', position: 1, slots: [{ id: 'y', type: 'text', props: { text: 'a = dv/dt' } }] },
      ],
    },
  ],
  ...over,
});

describe('stableStringify', () => {
  it('sorts object keys at every depth and keeps array order', () => {
    expect(stableStringify({ b: 1, a: { d: [3, 1], c: null } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}');
  });

  it('drops undefined-valued keys like JSON.stringify, and writes undefined array items as null', () => {
    expect(stableStringify({ a: undefined, b: [undefined, 1] })).toBe('{"b":[null,1]}');
  });
});

describe('contentHash', () => {
  it('is a base36 string, identical for identical content', () => {
    expect(contentHash(nb())).toMatch(/^[0-9a-z]+$/);
    expect(contentHash(nb())).toBe(contentHash(nb()));
  });

  it('ignores key order (a notebook loaded from SQLite vs the same one built in memory)', () => {
    const a = nb();
    const reordered = JSON.parse(JSON.stringify(a), function (_k, v) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.fromEntries(Object.entries(v).reverse());
      }
      return v;
    }) as Notebook;
    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(a)[0]);
    expect(contentHash(reordered)).toBe(contentHash(a));
  });

  it('excludes updatedAt (every save stamps it), and nothing else', () => {
    expect(contentHash(nb({ updatedAt: '2030-01-01T00:00:00.000Z' }))).toBe(contentHash(nb()));
    expect(contentHash(nb({ createdAt: '2030-01-01T00:00:00.000Z' }))).not.toBe(contentHash(nb()));
  });

  it('changes with any content change', () => {
    const base = contentHash(nb());
    const text = nb();
    text.sections[0].cards[0].slots[0].props.text = 'v = d / t';
    const order = nb();
    order.sections[0].cards.reverse();
    const draft = nb();
    draft.sections[0].cards[1].draft = true;
    for (const changed of [nb({ name: 'Physics II' }), nb({ subtitle: 'Week 1' }), text, order, draft]) {
      expect(contentHash(changed)).not.toBe(base);
    }
  });
});

describe('shouldAutoSnapshot', () => {
  const last = (msAgo: number, hash = 'h1') => ({ createdAt: ago(msAgo), hash });

  it('is true when the notebook has no snapshot yet', () => {
    expect(shouldAutoSnapshot({ last: null, now: NOW, hash: 'h1' })).toBe(true);
  });

  it('is false inside the 10-minute window, even when the content changed', () => {
    expect(AUTO_SNAPSHOT_EVERY_MS).toBe(10 * MIN);
    expect(shouldAutoSnapshot({ last: last(5 * MIN), now: NOW, hash: 'h2' })).toBe(false);
    expect(shouldAutoSnapshot({ last: last(10 * MIN - 1), now: NOW, hash: 'h2' })).toBe(false);
  });

  it('is true from 10 minutes on when the content changed', () => {
    expect(shouldAutoSnapshot({ last: last(10 * MIN), now: NOW, hash: 'h2' })).toBe(true);
    expect(shouldAutoSnapshot({ last: last(3 * DAY), now: NOW, hash: 'h2' })).toBe(true);
  });

  it('is false when the content is unchanged, however old the last snapshot is', () => {
    expect(shouldAutoSnapshot({ last: last(11 * MIN), now: NOW, hash: 'h1' })).toBe(false);
    expect(shouldAutoSnapshot({ last: last(40 * DAY), now: NOW, hash: 'h1' })).toBe(false);
  });

  it('a clock that moved back does not stop snapshots until it catches up', () => {
    expect(shouldAutoSnapshot({ last: last(-2 * HOUR), now: NOW, hash: 'h2' })).toBe(true);
    // A small skew still rate-limits.
    expect(shouldAutoSnapshot({ last: last(-2 * MIN), now: NOW, hash: 'h2' })).toBe(false);
  });

  it('an unreadable timestamp counts as old', () => {
    expect(shouldAutoSnapshot({ last: { createdAt: 'garbage', hash: 'h1' }, now: NOW, hash: 'h2' })).toBe(true);
    expect(shouldAutoSnapshot({ last: { createdAt: 'garbage', hash: 'h1' }, now: NOW, hash: 'h1' })).toBe(false);
  });
});

describe('pruneIds — retention', () => {
  const s = (id: string, createdAt: string, reason = 'auto'): SnapshotStamp => ({ id, createdAt, reason });
  const sorted = (ids: string[]) => [...ids].sort();

  it('prunes nothing from an empty or small recent history', () => {
    expect(pruneIds([], NOW)).toEqual([]);
    const recent = [s('a', ago(1 * MIN)), s('b', ago(3 * HOUR)), s('c', ago(23 * HOUR + 59 * MIN))];
    expect(pruneIds(recent, NOW)).toEqual([]);
  });

  it('keeps every snapshot of the last 24h up to the 50 most recent', () => {
    expect(RECENT_KEEP).toBe(50);
    // 60 snapshots 10 minutes apart, all inside the last 10 hours of today.
    const many = Array.from({ length: 60 }, (_, i) => s(`r${String(i).padStart(2, '0')}`, ago(i * 10 * MIN)));
    const pruned = pruneIds(many, NOW);
    // r00..r49 are the 50 newest; of the overflow r50..r59 (all today), only the day's newest (r50) stays.
    expect(sorted(pruned)).toEqual(['r51', 'r52', 'r53', 'r54', 'r55', 'r56', 'r57', 'r58', 'r59']);
  });

  it('overflow beyond 50 still keeps yesterday: its newest snapshot survives a busy today', () => {
    const today = Array.from({ length: 55 }, (_, i) => s(`t${i}`, ago(i * 10 * MIN))); // 15:00 back to ~05:50
    const yesterday = [s('y_late', local(17, 21)), s('y_early', local(17, 18))]; // < 24h old, but beyond the 50
    const pruned = pruneIds([...today, ...yesterday], NOW);
    expect(pruned).not.toContain('y_late');
    expect(pruned).toContain('y_early');
    expect(pruned).not.toContain('t50'); // newest of today's overflow
    expect(pruned).toEqual(expect.arrayContaining(['t51', 't52', 't53', 't54']));
  });

  it('older than 24h: keeps at most one per calendar day, the newest of that day', () => {
    const snaps = [
      s('d16_late', local(16, 22)),
      s('d16_mid', local(16, 12)),
      s('d16_early', local(16, 8)),
      s('d10_only', local(10, 9)),
      s('d15_a', local(15, 23, 59)),
      s('d15_b', local(15, 0, 1)),
    ];
    expect(sorted(pruneIds(snaps, NOW))).toEqual(['d15_b', 'd16_early', 'd16_mid']);
  });

  it('calendar days are local: 23:59 and 00:01 are different days', () => {
    const snaps = [s('d14_2359', local(14, 23, 59)), s('d15_0001', local(15, 0, 1))];
    expect(pruneIds(snaps, NOW)).toEqual([]);
  });

  it('deletes automatic snapshots older than 30 days', () => {
    const snaps = [s('d29', ago(29 * DAY)), s('d31', ago(31 * DAY)), s('d90', ago(90 * DAY))];
    expect(sorted(pruneIds(snaps, NOW))).toEqual(['d31', 'd90']);
  });

  it('keeps the 20 newest manual snapshots regardless of age', () => {
    expect(MANUAL_KEEP).toBe(20);
    const manual = Array.from({ length: 22 }, (_, i) => s(`m${String(i).padStart(2, '0')}`, ago((40 + i) * DAY), 'manual'));
    // m00..m19 are protected; m20/m21 fall back to the normal rules and are > 30 days old.
    expect(sorted(pruneIds(manual, NOW))).toEqual(['m20', 'm21']);
  });

  it('a manual snapshot beyond the 20 still lives under the normal rules (a recent one is kept)', () => {
    const manual = Array.from({ length: 21 }, (_, i) => s(`m${String(i).padStart(2, '0')}`, ago((i + 1) * MIN), 'manual'));
    expect(pruneIds(manual, NOW)).toEqual([]);
  });

  it('manual snapshots do not use up the 50 recent slots', () => {
    const autos = Array.from({ length: 50 }, (_, i) => s(`a${i}`, ago(i * 10 * MIN)));
    const manual = Array.from({ length: 5 }, (_, i) => s(`m${i}`, ago(i * 10 * MIN + 1), 'manual'));
    expect(pruneIds([...autos, ...manual], NOW)).toEqual([]);
  });

  it('treats before-restore snapshots like automatic ones', () => {
    const snaps = [s('br_old', ago(31 * DAY), 'before-restore'), s('br_new', ago(1 * HOUR), 'before-restore')];
    expect(pruneIds(snaps, NOW)).toEqual(['br_old']);
  });

  it('never prunes a snapshot whose timestamp it cannot read', () => {
    expect(pruneIds([s('bad', 'not a date'), s('old', ago(40 * DAY))], NOW)).toEqual(['old']);
  });

  it('is deterministic for equal timestamps (id breaks the tie) and leaves its input alone', () => {
    const t = local(12, 10);
    const input = [s('b', t), s('a', t), s('c', t)];
    const copy = structuredClone(input);
    expect(sorted(pruneIds(input, NOW))).toEqual(['a', 'b']);
    expect(input).toEqual(copy);
  });
});

describe('restoredNotebook', () => {
  const current = nb({ id: 'nb1', name: 'Physics (renamed)', createdAt: '2026-01-01T00:00:00.000Z' });

  it('takes the snapshot’s content but keeps the current id and creation time', () => {
    const old = nb({
      name: 'Physics',
      subtitle: 'old subtitle',
      createdAt: '1999-01-01T00:00:00.000Z',
      sections: [{ id: 's9', notebookId: 'nb1', name: 'Old', position: 0, cards: [] }],
    });
    const out = restoredNotebook(old, current);
    expect(out.id).toBe('nb1');
    expect(out.createdAt).toBe(current.createdAt);
    expect(out.name).toBe('Physics');
    expect(out.subtitle).toBe('old subtitle');
    expect(out.sections.map((x) => x.id)).toEqual(['s9']);
  });

  it('re-homes every section on the current notebook id', () => {
    const foreign = nb({ id: 'nbX', sections: [{ id: 's1', notebookId: 'nbX', name: 'S', position: 0, cards: [] }] });
    const out = restoredNotebook(foreign, current);
    expect(out.id).toBe('nb1');
    expect(out.sections[0].notebookId).toBe('nb1');
  });

  it('keeps the current name when the snapshot’s is blank', () => {
    expect(restoredNotebook(nb({ name: '   ' }), current).name).toBe('Physics (renamed)');
  });

  it('derives the tag list when the snapshot has none', () => {
    const old = nb();
    delete old.cats;
    expect(restoredNotebook(old, current).cats).toEqual(['a']);
  });
});

describe('relativeTime', () => {
  it('reads recent times in minutes and hours', () => {
    expect(relativeTime(ago(20 * 1000), NOW)).toBe('just now');
    expect(relativeTime(ago(-30 * 1000), NOW)).toBe('just now');
    expect(relativeTime(ago(5 * MIN), NOW)).toBe('5 min ago');
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('59 min ago');
    expect(relativeTime(ago(3 * HOUR + 20 * MIN), NOW)).toBe('3 h ago');
  });

  it('reads older times in calendar days, then as a date', () => {
    expect(relativeTime(local(17, 9), NOW)).toBe('yesterday');
    expect(relativeTime(local(14, 9), NOW)).toBe('4 days ago');
    const old = relativeTime(local(2, 9), NOW);
    expect(old).toMatch(/2/);
    expect(old).not.toMatch(/ago/);
  });

  it('returns an unreadable timestamp as it is', () => {
    expect(relativeTime('whenever', NOW)).toBe('whenever');
  });
});

describe('reasonLabel', () => {
  it('names each reason for people', () => {
    expect(reasonLabel('auto')).toBe('Auto-saved');
    expect(reasonLabel('manual')).toBe('Saved by you');
    expect(reasonLabel('before-restore')).toBe('Before a restore');
    expect(reasonLabel('something-new')).toBe('something-new');
  });
});
