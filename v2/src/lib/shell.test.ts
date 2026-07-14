import { describe, it, expect } from 'vitest';
import { clampSideW, parseSideWidthPref } from './shell';

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
