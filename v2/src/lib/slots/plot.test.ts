import { describe, it, expect } from 'vitest';
import { plotSVG, sampleCurve, resolveYRange, buildPath, hoverAt, fmtNum } from './plot';

describe('resolveYRange', () => {
  it('uses the fixed range when both bounds finite and y1>y0', () => {
    expect(resolveYRange(-100, 100, 0, 10)).toEqual({ y0: 0, y1: 10 });
  });

  it('falls back to the sampled extent when bounds are missing', () => {
    expect(resolveYRange(2, 8, undefined, undefined)).toEqual({ y0: 2, y1: 8 });
  });

  it('falls back when y1<=y0 (degenerate fixed range)', () => {
    expect(resolveYRange(2, 8, 10, 10)).toEqual({ y0: 2, y1: 8 });
  });

  it('pads a flat sampled extent by ±0.5', () => {
    expect(resolveYRange(5, 5, undefined, undefined)).toEqual({ y0: 4.5, y1: 5.5 });
  });
});

describe('buildPath', () => {
  it('breaks the pen (M) after a point leaves the y-range instead of clamping', () => {
    // three points: in, out (above), in → two disjoint sub-paths, both starting with M.
    const pts: Array<[number, number]> = [
      [0, 1],
      [1, 5],
      [2, 1],
    ];
    const d = buildPath(pts, 0, 2, 0, 2);
    expect(d.match(/M/g)?.length).toBe(2);
    expect(d).not.toContain('NaN');
  });

  it('emits a single connected run when all points are in range', () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    const d = buildPath(pts, 0, 2, 0, 2);
    expect(d.match(/M/g)?.length).toBe(1);
    expect(d.match(/L/g)?.length).toBe(2);
  });
});

describe('sampleCurve', () => {
  it('tracks the finite min/max over the interval', () => {
    const { mn, mx } = sampleCurve('x', {}, 0, 10);
    expect(mn).toBeCloseTo(0);
    expect(mx).toBeCloseTo(10);
  });
});

describe('plotSVG', () => {
  it('draws gridlines at opacity .22 and tick labels when ticks are set', () => {
    const svg = plotSVG({ fn: 'x', x0: 0, x1: 10, y0: 0, y1: 10, xticks: 5, yticks: 5 }, {});
    expect(svg).toContain('opacity=".22"');
    // xticks:5 → 6 vertical gridlines; yticks:5 → 6 horizontal.
    expect(svg.match(/opacity="\.22"/g)?.length).toBe(12);
  });

  it('keeps the corner labels (no gridlines) when ticks are absent', () => {
    const svg = plotSVG({ fn: 'x', x0: 0, x1: 10 }, {});
    expect(svg).not.toContain('opacity=".22"');
    expect(svg).toContain('>0<');
    expect(svg).toContain('>10<');
  });

  it('includes the hover crosshair + value elements (hidden) when hover is on', () => {
    const svg = plotSVG({ fn: 'x', x0: 0, x1: 10, hover: true }, {});
    expect(svg).toContain('class="chart-cur"');
    expect(svg).toContain('class="chart-val"');
    expect(svg).toContain('data-hover="1"');
    expect(svg).toContain('cursor:crosshair');
  });

  it('omits hover chrome when hover is off', () => {
    const svg = plotSVG({ fn: 'x', x0: 0, x1: 10, hover: false }, {});
    expect(svg).not.toContain('chart-cur');
    expect(svg).not.toContain('data-hover');
  });
});

describe('hoverAt', () => {
  const geom = { L: 44, pw: 264, x0: 0, x1: 10 };

  it('maps a mid-plot px to the curve value', () => {
    const { xv, yv, X } = hoverAt(44 + 132, geom, 'x', {});
    expect(xv).toBeCloseTo(5);
    expect(yv).toBeCloseTo(5);
    expect(X).toBeCloseTo(44 + 132);
  });

  it('clamps px outside the plot to the x domain', () => {
    expect(hoverAt(0, geom, 'x', {}).xv).toBe(0);
    expect(hoverAt(9999, geom, 'x', {}).xv).toBe(10);
  });

  it('reads scope variables as fn parameters', () => {
    const { yv } = hoverAt(44 + 264, { ...geom }, 'a * x', { a: 3 });
    expect(yv).toBeCloseTo(30);
  });
});

describe('fmtNum', () => {
  it('rounds to 3 decimals and uses precision for extremes', () => {
    expect(fmtNum(1.23456)).toBe('1.235');
    expect(fmtNum(123456)).toBe('1.23e+5');
    expect(fmtNum(Infinity)).toBe('0');
  });
});
