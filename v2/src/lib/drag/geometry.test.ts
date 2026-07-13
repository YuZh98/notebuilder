import { describe, it, expect } from 'vitest';
import {
  passedThreshold,
  insertionIndex,
  clampCardW,
  clampRoomW,
  fuseSplit,
  pointInRect,
  remapIndex,
  type Rect,
} from './geometry';

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe('passedThreshold', () => {
  it('is false just under the 5px default threshold', () => {
    expect(passedThreshold(0, 0, 4.99, 0)).toBe(false);
  });

  it('is true at exactly the 5px default threshold', () => {
    expect(passedThreshold(0, 0, 5, 0)).toBe(true);
  });

  it('is true past the threshold', () => {
    expect(passedThreshold(0, 0, 10, 0)).toBe(true);
  });

  it('respects a custom min', () => {
    expect(passedThreshold(0, 0, 2, 0, 3)).toBe(false);
    expect(passedThreshold(0, 0, 3, 0, 3)).toBe(true);
  });
});

describe('insertionIndex', () => {
  it('stays at overIdx when before the horizontal midpoint', () => {
    const rects = [rect(0, 0, 100, 20)];
    expect(insertionIndex(rects, 0, 40, 0, true)).toBe(0);
  });

  it('advances past overIdx when past the horizontal midpoint', () => {
    const rects = [rect(0, 0, 100, 20)];
    expect(insertionIndex(rects, 0, 60, 0, true)).toBe(1);
  });

  it('stays at overIdx when before the vertical midpoint (card-shell/ce-choice grids)', () => {
    const rects = [rect(0, 0, 100, 20)];
    expect(insertionIndex(rects, 0, 0, 5, false)).toBe(0);
  });

  it('advances past overIdx when past the vertical midpoint', () => {
    const rects = [rect(0, 0, 100, 20)];
    expect(insertionIndex(rects, 0, 0, 15, false)).toBe(1);
  });

  it('offsets from a non-zero overIdx', () => {
    // rects[2] spans y 40..60, midpoint 50
    const rects = [rect(0, 0, 100, 20), rect(0, 20, 100, 20), rect(0, 40, 100, 20)];
    expect(insertionIndex(rects, 2, 0, 45, false)).toBe(2);
    expect(insertionIndex(rects, 2, 0, 55, false)).toBe(3);
  });
});

describe('clampCardW', () => {
  it('clamps below the floor of 3', () => {
    expect(clampCardW(2.9)).toBe(3);
  });

  it('clamps above the ceiling of 12', () => {
    expect(clampCardW(12.4)).toBe(12);
  });

  it('snaps to the nearest 0.05 within range', () => {
    expect(clampCardW(7.13)).toBe(7.15);
  });

  it('leaves an already-snapped value untouched', () => {
    expect(clampCardW(6)).toBe(6);
  });
});

describe('clampRoomW', () => {
  it('floors at 240', () => {
    expect(clampRoomW(100, 900)).toBe(240);
  });

  it('ceilings at maxW', () => {
    expect(clampRoomW(1200, 900)).toBe(900);
  });

  it('rounds to the nearest integer within range', () => {
    expect(clampRoomW(500.6, 900)).toBe(501);
  });
});

describe('fuseSplit', () => {
  it('splits evenly at ratio .5', () => {
    expect(fuseSplit(3, 0.5)).toEqual([1.5, 1.5]);
  });

  it('clamps the ratio at the .15 floor', () => {
    const [l, r] = fuseSplit(10, 0.05);
    expect(l).toBeCloseTo(1.5, 2);
    expect(r).toBeCloseTo(8.5, 2);
  });

  it('clamps the ratio at the .85 ceiling', () => {
    const [l, r] = fuseSplit(10, 0.95);
    expect(l).toBeCloseTo(8.5, 2);
    expect(r).toBeCloseTo(1.5, 2);
  });

  it('preserves the total to 2dp', () => {
    const [l, r] = fuseSplit(7, 0.3333);
    expect(Math.round((l + r) * 100) / 100).toBe(7);
  });
});

describe('pointInRect', () => {
  const r = rect(10, 10, 100, 50);

  it('is true inside the rect', () => {
    expect(pointInRect(50, 30, r)).toBe(true);
  });

  it('is true on the inclusive edges', () => {
    expect(pointInRect(10, 10, r)).toBe(true);
    expect(pointInRect(110, 60, r)).toBe(true);
  });

  it('is false outside the rect', () => {
    expect(pointInRect(5, 30, r)).toBe(false);
    expect(pointInRect(50, 5, r)).toBe(false);
    expect(pointInRect(115, 30, r)).toBe(false);
    expect(pointInRect(50, 65, r)).toBe(false);
  });
});

describe('remapIndex', () => {
  it('maps the moved item itself to the destination index', () => {
    expect(remapIndex(3, 3, 1)).toBe(1);
  });

  it('shifts an index between the old and new position down when moving forward', () => {
    // from=1 -> to=4: items originally at 2,3,4 shift down by one
    expect(remapIndex(2, 1, 4)).toBe(1);
    expect(remapIndex(3, 1, 4)).toBe(2);
    expect(remapIndex(4, 1, 4)).toBe(3);
  });

  it('shifts an index between the new and old position up when moving backward', () => {
    // from=4 -> to=1: items originally at 1,2,3 shift up by one
    expect(remapIndex(1, 4, 1)).toBe(2);
    expect(remapIndex(2, 4, 1)).toBe(3);
    expect(remapIndex(3, 4, 1)).toBe(4);
  });

  it('leaves indices outside the affected range untouched', () => {
    expect(remapIndex(0, 2, 4)).toBe(0);
    expect(remapIndex(5, 2, 4)).toBe(5);
  });
});
