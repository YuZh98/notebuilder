// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { builtinCardTypes, type SlotTemplate } from './card-types';
import { buildCardScope } from './card-scope';
import { evalExpr } from './expr';
import { sampleCurve } from './slots/plot';
import { getSlot } from './slots/registry';
import type { Scope } from './variable-graph';
import type { Slot } from './types';

const ironfly = builtinCardTypes.find((t) => t.id === 'ct_ironfly')!;

// The builtin's own template objects, given ids but not cloned: a typo in card-types.ts lands here.
const slots: Slot[] = ironfly.slots.map((t: SlotTemplate, i) => ({ id: `s${i}`, ...t }));

const chart = slots.find((s) => s.type === 'chart')!.props as { fn: string; x0: number; x1: number };
const sliderDefault = (key: string): number => {
  const s = slots.find((sl) => sl.type === 'slider' && sl.props.key === key);
  if (!s) throw new Error(`ct_ironfly has no "${key}" slider`);
  return s.props.value as number;
};
const payoffAt = (scope: Scope, x: number): number => evalExpr(chart.fn, { ...scope, x }) as number;

describe('ct_ironfly sliders', () => {
  it('defaults to K0 = 100, W = 10, C = 3.5', () => {
    expect(sliderDefault('K0')).toBe(100);
    expect(sliderDefault('W')).toBe(10);
    expect(sliderDefault('C')).toBe(3.5);
  });
});

describe('ct_ironfly computes at the slider defaults', () => {
  const scope = buildCardScope(slots, {});

  it('max profit = the net credit = 3.5', () => {
    expect(scope.maxProfit).toBe(3.5);
  });

  it('max loss = credit - wing width = 3.5 - 10 = -6.5', () => {
    expect(scope.maxLoss).toBe(-6.5);
  });

  it('breakeven low = K0 - C = 100 - 3.5 = 96.5', () => {
    expect(scope.beLow).toBe(96.5);
  });

  it('breakeven high = K0 + C = 100 + 3.5 = 103.5', () => {
    expect(scope.beHigh).toBe(103.5);
  });
});

describe('ct_ironfly payoff curve at the slider defaults', () => {
  const scope = buildCardScope(slots, {});

  it('peaks at the short strike with the full credit', () => {
    expect(payoffAt(scope, 100)).toBe(3.5);
  });

  it('crosses zero at both breakevens', () => {
    expect(payoffAt(scope, 96.5)).toBe(0);
    expect(payoffAt(scope, 103.5)).toBe(0);
  });

  it('floors at the max loss from each wing outward', () => {
    expect(payoffAt(scope, 90)).toBe(-6.5); // lower wing K0 - W
    expect(payoffAt(scope, 110)).toBe(-6.5); // upper wing K0 + W
    expect(payoffAt(scope, chart.x0)).toBe(-6.5);
    expect(payoffAt(scope, chart.x1)).toBe(-6.5);
  });

  it('is linear between the short strike and each wing', () => {
    expect(payoffAt(scope, 95)).toBe(-1.5); // 3.5 - 5
    expect(payoffAt(scope, 105)).toBe(-1.5);
  });

  it('never dips below the max loss anywhere in the plotted window', () => {
    const { mn } = sampleCurve(chart.fn, scope, chart.x0, chart.x1);
    expect(mn).toBe(-6.5);
  });
});

describe('ct_ironfly at non-default sliders', () => {
  // K0 = 120, W = 25, C = 8 — each the top of its slider's range.
  const scope = buildCardScope(slots, { K0: 120, W: 25, C: 8 });

  it('recomputes every derived number', () => {
    expect(scope.maxProfit).toBe(8);
    expect(scope.maxLoss).toBe(-17); // 8 - 25
    expect(scope.beLow).toBe(112); // 120 - 8
    expect(scope.beHigh).toBe(128); // 120 + 8
  });

  it('reshapes the payoff curve to match', () => {
    expect(payoffAt(scope, 120)).toBe(8);
    expect(payoffAt(scope, 112)).toBe(0);
    expect(payoffAt(scope, 128)).toBe(0);
    expect(payoffAt(scope, 95)).toBe(-17); // lower wing K0 - W
    expect(payoffAt(scope, 145)).toBe(-17); // upper wing K0 + W
  });
});

describe('ct_ironfly prose', () => {
  it('quotes only variables the card actually writes', () => {
    const scope = buildCardScope(slots, {});
    const quoted = slots
      .filter((s) => s.type === 'text')
      .flatMap((s) => getSlot('text')!.variables(s.props).reads.map((r) => r.key));

    expect(quoted).toEqual(['maxProfit', 'maxLoss', 'beLow', 'beHigh']);
    for (const key of quoted) expect(scope).toHaveProperty(key);
  });
});
