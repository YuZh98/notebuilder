import { describe, it, expect } from 'vitest';
import { revealOk, shouldShow, isLocked, verbClasses } from './verbs';

describe('revealOk', () => {
  it('== true when values match', () => {
    expect(revealOk({ key: 'x', op: '==', val: 3 }, { x: 3 })).toBe(true);
  });

  it('== false when values differ', () => {
    expect(revealOk({ key: 'x', op: '==', val: 3 }, { x: 4 })).toBe(false);
  });

  it('!= true when values differ', () => {
    expect(revealOk({ key: 'x', op: '!=', val: 3 }, { x: 5 })).toBe(true);
  });

  it('!= false when values match', () => {
    expect(revealOk({ key: 'x', op: '!=', val: 3 }, { x: 3 })).toBe(false);
  });

  it('>= true when scope value is equal', () => {
    expect(revealOk({ key: 'x', op: '>=', val: 3 }, { x: 3 })).toBe(true);
  });

  it('>= true when scope value is greater', () => {
    expect(revealOk({ key: 'x', op: '>=', val: 3 }, { x: 5 })).toBe(true);
  });

  it('>= false when scope value is less', () => {
    expect(revealOk({ key: 'x', op: '>=', val: 3 }, { x: 2 })).toBe(false);
  });

  it('<= true when scope value is equal', () => {
    expect(revealOk({ key: 'x', op: '<=', val: 3 }, { x: 3 })).toBe(true);
  });

  it('<= true when scope value is less', () => {
    expect(revealOk({ key: 'x', op: '<=', val: 3 }, { x: 1 })).toBe(true);
  });

  it('<= false when scope value is greater', () => {
    expect(revealOk({ key: 'x', op: '<=', val: 3 }, { x: 4 })).toBe(false);
  });

  it('> true when scope value is greater', () => {
    expect(revealOk({ key: 'x', op: '>', val: 3 }, { x: 4 })).toBe(true);
  });

  it('> false when scope value is equal', () => {
    expect(revealOk({ key: 'x', op: '>', val: 3 }, { x: 3 })).toBe(false);
  });

  it('< true when scope value is less', () => {
    expect(revealOk({ key: 'x', op: '<', val: 3 }, { x: 2 })).toBe(true);
  });

  it('< false when scope value is equal', () => {
    expect(revealOk({ key: 'x', op: '<', val: 3 }, { x: 3 })).toBe(false);
  });

  it('returns false when key is missing from scope', () => {
    expect(revealOk({ key: 'missing', op: '==', val: 0 }, {})).toBe(false);
  });

  it('works with boolean values', () => {
    expect(revealOk({ key: 'done', op: '==', val: true }, { done: true })).toBe(true);
    expect(revealOk({ key: 'done', op: '==', val: true }, { done: false })).toBe(false);
  });
});

describe('shouldShow', () => {
  it('returns true when verbs is undefined', () => {
    expect(shouldShow(undefined, {}, false)).toBe(true);
  });

  it('returns true when verbs is empty object', () => {
    expect(shouldShow({}, {}, false)).toBe(true);
  });

  it('returns false when reveal condition is false', () => {
    expect(shouldShow({ reveal: { key: 'x', op: '==', val: 5 } }, { x: 0 }, true)).toBe(false);
  });

  it('returns true when reveal condition is true', () => {
    expect(shouldShow({ reveal: { key: 'x', op: '==', val: 5 } }, { x: 5 }, true)).toBe(true);
  });

  it('returns false when sequential and priorComplete is false', () => {
    expect(shouldShow({ sequential: true }, {}, false)).toBe(false);
  });

  it('returns true when sequential and priorComplete is true', () => {
    expect(shouldShow({ sequential: true }, {}, true)).toBe(true);
  });

  it('returns false when both reveal false and sequential with priorComplete false', () => {
    expect(shouldShow({ reveal: { key: 'x', op: '==', val: 1 }, sequential: true }, { x: 0 }, false)).toBe(false);
  });

  it('returns false when reveal false but sequential priorComplete true', () => {
    expect(shouldShow({ reveal: { key: 'x', op: '==', val: 1 }, sequential: true }, { x: 0 }, true)).toBe(false);
  });

  it('returns false when reveal true but sequential priorComplete false', () => {
    expect(shouldShow({ reveal: { key: 'x', op: '==', val: 1 }, sequential: true }, { x: 1 }, false)).toBe(false);
  });

  it('returns true when reveal true and sequential priorComplete true', () => {
    expect(shouldShow({ reveal: { key: 'x', op: '==', val: 1 }, sequential: true }, { x: 1 }, true)).toBe(true);
  });

  it('ignores sequential:false — does not gate on priorComplete', () => {
    expect(shouldShow({ sequential: false }, {}, false)).toBe(true);
  });
});

describe('isLocked', () => {
  it('returns false when locked is undefined', () => {
    expect(isLocked(undefined, {})).toBe(false);
  });

  it('returns true when condition evaluates to 0 (falsy)', () => {
    expect(isLocked({ condition: 'x == 5' }, { x: 0 })).toBe(true);
  });

  it('returns false when condition evaluates to truthy (non-zero)', () => {
    expect(isLocked({ condition: 'x == 5' }, { x: 5 })).toBe(false);
  });

  it('returns true when condition is a boolean false expression', () => {
    expect(isLocked({ condition: 'done' }, { done: false })).toBe(true);
  });

  it('returns false when condition is a boolean true expression', () => {
    expect(isLocked({ condition: 'done' }, { done: true })).toBe(false);
  });

  it('returns true when condition references missing key (evaluates to 0)', () => {
    expect(isLocked({ condition: 'missing' }, {})).toBe(true);
  });
});

describe('verbClasses', () => {
  it('returns empty string when verbs is undefined', () => {
    expect(verbClasses(undefined)).toBe('');
  });

  it('returns empty string when no glow or emphasis', () => {
    expect(verbClasses({})).toBe('');
  });

  it('returns "glow" when glow is true', () => {
    expect(verbClasses({ glow: true })).toBe('glow');
  });

  it('returns "emphasis" when emphasis is true', () => {
    expect(verbClasses({ emphasis: true })).toBe('emphasis');
  });

  it('returns "glow emphasis" when both are true', () => {
    expect(verbClasses({ glow: true, emphasis: true })).toBe('glow emphasis');
  });

  it('omits glow when glow is false', () => {
    expect(verbClasses({ glow: false, emphasis: true })).toBe('emphasis');
  });

  it('omits emphasis when emphasis is false', () => {
    expect(verbClasses({ glow: true, emphasis: false })).toBe('glow');
  });
});
