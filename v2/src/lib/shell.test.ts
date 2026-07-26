import { describe, it, expect } from 'vitest';
import { clampSideW, parseSideWidthPref, sideWidthAt } from './shell';

describe('clampSideW', () => {
  it('passes in-range widths through', () => {
    expect(clampSideW(312)).toBe(312);
    expect(clampSideW(220)).toBe(220);
    expect(clampSideW(560)).toBe(560);
  });

  it('clamps below 220 and above 560', () => {
    expect(clampSideW(0)).toBe(220);
    expect(clampSideW(219)).toBe(220);
    expect(clampSideW(561)).toBe(560);
    expect(clampSideW(10000)).toBe(560);
    expect(clampSideW(-50)).toBe(220);
  });
});

describe('parseSideWidthPref', () => {
  it('parses a stored width and clamps it', () => {
    expect(parseSideWidthPref('300')).toBe(300);
    expect(parseSideWidthPref('100')).toBe(220);
    expect(parseSideWidthPref('9999')).toBe(560);
  });

  it('returns null for a missing preference', () => {
    expect(parseSideWidthPref(null)).toBe(null);
  });

  it('returns null for malformed values', () => {
    expect(parseSideWidthPref('')).toBe(null);
    expect(parseSideWidthPref('abc')).toBe(null);
    expect(parseSideWidthPref('NaN')).toBe(null);
  });

  it('keeps parseInt leniency for numeric prefixes', () => {
    expect(parseSideWidthPref('300px')).toBe(300);
    expect(parseSideWidthPref(' 400 ')).toBe(400);
  });
});

// `--sidew` is a CSS width inside the zoomed <body>, so the pointer's viewport x has to be
// converted before it lands there — otherwise the edge overshoots the cursor by the zoom factor.
describe('sideWidthAt', () => {
  it('is the clamped pointer x at zoom 1', () => {
    expect(sideWidthAt(300, 1)).toBe(300);
    expect(sideWidthAt(100, 1)).toBe(220);
  });

  it('puts the rendered edge under the cursor at other zooms', () => {
    for (const [x, zoom] of [
      [450, 1.5],
      [600, 2],
      [150, 0.5],
    ] as const) {
      expect(sideWidthAt(x, zoom) * zoom).toBeCloseTo(x, 6);
    }
  });

  it('clamps in the width space, not the pointer space', () => {
    expect(sideWidthAt(2000, 1.5)).toBe(560); // 1333 → clamped
    expect(sideWidthAt(200, 1.5)).toBe(220); // 133 → clamped
    expect(sideWidthAt(840, 1.5)).toBe(560); // exactly at the max
  });
});
