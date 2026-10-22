// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildCardScope } from './card-scope';
import type { Slot } from './types';

const slider = (id: string, key: string, value: number): Slot => ({
  id,
  type: 'slider',
  props: { key, value },
});

const compute = (id: string, expr: string, out: string): Slot => ({
  id,
  type: 'compute',
  props: { expr, out },
});

describe('buildCardScope', () => {
  it('drives slider -> compute (m = n*n)', () => {
    const slots: Slot[] = [slider('s1', 'n', 3), compute('c1', 'n*n', 'm')];
    expect(buildCardScope(slots, {}).m).toBe(9);
  });

  it('recomputes when the input changes', () => {
    const slots: Slot[] = [slider('s1', 'n', 3), compute('c1', 'n*n', 'm')];
    expect(buildCardScope(slots, { n: 5 }).m).toBe(25);
  });

  it('resolves a transitive chain slider -> compute -> compute', () => {
    const slots: Slot[] = [
      slider('s1', 'n', 4),
      compute('c1', 'n*n', 'm'),
      compute('c2', 'm+1', 'p'),
    ];
    const scope = buildCardScope(slots, {});
    expect(scope.m).toBe(16);
    expect(scope.p).toBe(17);
  });

  it('surfaces a cycle as a thrown error', () => {
    const slots: Slot[] = [compute('c1', 'b', 'a'), compute('c2', 'a', 'b')];
    expect(() => buildCardScope(slots, {})).toThrow(/Cycle detected/);
  });
});