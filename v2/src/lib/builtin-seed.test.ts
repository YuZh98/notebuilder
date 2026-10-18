import { describe, it, expect } from 'vitest';
import { planBuiltinSeed, LEGACY_BUILTIN_IDS, BUILTIN_SEEDED_PREF } from './builtin-seed';
import { builtinCardTypes, type CardType } from './card-types';

const ct = (id: string): CardType => ({ id, name: id, slots: [{ type: 'text', props: { text: id } }] });
const LEGACY = [...LEGACY_BUILTIN_IDS];
// A catalog as it ships after this feature: the ten legacy built-ins plus two new ones.
const BUILTINS: CardType[] = [...LEGACY.map(ct), ct('ct_new1'), ct('ct_new2')];
const ids = (types: CardType[]) => types.map((t) => t.id);
const pref = (list: string[]) => JSON.stringify(list);

describe('LEGACY_BUILTIN_IDS', () => {
  it('lists exactly the ten built-ins that shipped before seeding was tracked, all still built in', () => {
    expect(LEGACY).toEqual([
      'ct_flashcard', 'ct_quiz', 'ct_note', 'ct_tracker', 'ct_mastery',
      'ct_sliderlab', 'ct_gaussian', 'ct_payoff', 'ct_compound', 'ct_quizcard',
    ]);
    expect(ids(builtinCardTypes).slice(0, LEGACY.length)).toEqual(LEGACY);
  });

  it('stores the record under the builtin_seeded preference', () => {
    expect(BUILTIN_SEEDED_PREF).toBe('builtin_seeded');
  });
});

describe('planBuiltinSeed', () => {
  it('a brand-new install (empty table, no record) seeds every built-in, in catalog order', () => {
    const plan = planBuiltinSeed({ existingIds: [], seededPref: null, builtins: BUILTINS });
    expect(ids(plan.toSeed)).toEqual(ids(BUILTINS));
    expect(plan.nextSeeded).toEqual(ids(BUILTINS));
  });

  it('a user from before this feature (types stored, no record) gets only the new built-ins', () => {
    const plan = planBuiltinSeed({ existingIds: [...LEGACY, 'ct_mine'], seededPref: null, builtins: BUILTINS });
    expect(ids(plan.toSeed)).toEqual(['ct_new1', 'ct_new2']);
    expect(plan.nextSeeded).toEqual([...LEGACY, 'ct_new1', 'ct_new2']);
  });

  it('…and a legacy built-in they deleted before upgrading never comes back', () => {
    const kept = LEGACY.filter((id) => id !== 'ct_quiz' && id !== 'ct_gaussian');
    const plan = planBuiltinSeed({ existingIds: kept, seededPref: null, builtins: BUILTINS });
    expect(ids(plan.toSeed)).toEqual(['ct_new1', 'ct_new2']);
    expect(plan.nextSeeded).toContain('ct_quiz');
    expect(plan.nextSeeded).toContain('ct_gaussian');
  });

  it('…even when they had deleted every built-in and kept only their own types', () => {
    const plan = planBuiltinSeed({ existingIds: ['ct_mine'], seededPref: null, builtins: BUILTINS });
    expect(ids(plan.toSeed)).toEqual(['ct_new1', 'ct_new2']);
  });

  it('with a record, seeds only built-ins never seeded before', () => {
    const plan = planBuiltinSeed({
      existingIds: [...LEGACY, 'ct_new1'],
      seededPref: pref([...LEGACY, 'ct_new1']),
      builtins: BUILTINS,
    });
    expect(ids(plan.toSeed)).toEqual(['ct_new2']);
    expect(plan.nextSeeded).toEqual([...LEGACY, 'ct_new1', 'ct_new2']);
  });

  it('a seeded built-in the user deleted is never seeded again', () => {
    const all = ids(BUILTINS);
    const plan = planBuiltinSeed({
      existingIds: all.filter((id) => id !== 'ct_new1' && id !== 'ct_note'),
      seededPref: pref(all),
      builtins: BUILTINS,
    });
    expect(plan.toSeed).toEqual([]);
    expect(plan.nextSeeded).toEqual(all);
  });

  it('an emptied table with a record stays empty (the user deleted everything)', () => {
    const plan = planBuiltinSeed({ existingIds: [], seededPref: pref(ids(BUILTINS)), builtins: BUILTINS });
    expect(plan.toSeed).toEqual([]);
  });

  it('never overwrites a built-in already in the table (it may hold the user’s edits), but records it', () => {
    // E.g. the record write failed last launch after the types were saved.
    const plan = planBuiltinSeed({
      existingIds: [...LEGACY, 'ct_new1'],
      seededPref: pref(LEGACY),
      builtins: BUILTINS,
    });
    expect(ids(plan.toSeed)).toEqual(['ct_new2']);
    expect(plan.nextSeeded).toEqual([...LEGACY, 'ct_new1', 'ct_new2']);
  });

  it('keeps ids it does not know (a newer version’s built-ins), so a downgrade round trip resurrects nothing', () => {
    const plan = planBuiltinSeed({
      existingIds: LEGACY,
      seededPref: pref(['ct_future', ...LEGACY]),
      builtins: BUILTINS,
    });
    expect(plan.nextSeeded).toEqual(['ct_future', ...LEGACY, 'ct_new1', 'ct_new2']);
  });

  it.each([
    ['not JSON', '{oops'],
    ['not an array', '{"ct_quiz":true}'],
    ['a JSON string', '"ct_quiz"'],
    ['JSON null', 'null'],
  ])('a malformed record (%s) is treated as absent', (_label, bad) => {
    const upgraded = planBuiltinSeed({ existingIds: LEGACY, seededPref: bad, builtins: BUILTINS });
    expect(ids(upgraded.toSeed)).toEqual(['ct_new1', 'ct_new2']);
    const fresh = planBuiltinSeed({ existingIds: [], seededPref: bad, builtins: BUILTINS });
    expect(ids(fresh.toSeed)).toEqual(ids(BUILTINS));
  });

  it('ignores non-string and duplicate entries in the record', () => {
    const plan = planBuiltinSeed({
      existingIds: LEGACY,
      seededPref: JSON.stringify([...LEGACY, 3, null, 'ct_quiz', 'ct_new1']),
      builtins: BUILTINS,
    });
    expect(ids(plan.toSeed)).toEqual(['ct_new2']);
    expect(plan.nextSeeded).toEqual([...LEGACY, 'ct_new1', 'ct_new2']);
  });

  it('is idempotent: re-planning after applying a plan seeds nothing and keeps the same record', () => {
    for (const start of [
      { existingIds: [] as string[], seededPref: null },
      { existingIds: [...LEGACY, 'ct_mine'], seededPref: null },
      { existingIds: LEGACY.slice(2), seededPref: pref(LEGACY) },
    ]) {
      const first = planBuiltinSeed({ ...start, builtins: BUILTINS });
      const again = planBuiltinSeed({
        existingIds: [...start.existingIds, ...ids(first.toSeed)],
        seededPref: pref(first.nextSeeded),
        builtins: BUILTINS,
      });
      expect(again.toSeed).toEqual([]);
      expect(again.nextSeeded).toEqual(first.nextSeeded);
    }
  });

  it('returns independent copies and never mutates its inputs', () => {
    const builtins = [ct('ct_a'), ct('ct_b')];
    const before = JSON.stringify(builtins);
    const existingIds = ['ct_x'];
    const plan = planBuiltinSeed({ existingIds, seededPref: pref(['ct_x']), builtins });
    expect(ids(plan.toSeed)).toEqual(['ct_a', 'ct_b']);
    expect(plan.toSeed[0]).not.toBe(builtins[0]);
    (plan.toSeed[0].slots[0].props as { text: string }).text = 'edited';
    expect(JSON.stringify(builtins)).toBe(before);
    expect(existingIds).toEqual(['ct_x']);
  });

  it('with the real catalog, an upgrading user receives exactly the built-ins added since the legacy ten', () => {
    const plan = planBuiltinSeed({ existingIds: LEGACY, seededPref: null, builtins: builtinCardTypes });
    expect(ids(plan.toSeed)).toEqual(['ct_guided', 'ct_worked', 'ct_practiceset']);
  });
});
