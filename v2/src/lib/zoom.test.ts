import { describe, it, expect, afterEach } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';
import { nextZoom, zoomLabel, applyZoom, effectiveZoom, toZoomedSpace, widthAt } from './zoom';

// Vitest stubs `.css` imports, so the stylesheet is read off disk (`?raw` hands back '') —
// same route as CardView.test.ts's app.css contract test.
const appCss: string = readFileSync('src/app.css', 'utf8');

const zoomOf = (el: HTMLElement) => (el.style as CSSStyleDeclaration & { zoom?: string }).zoom;

afterEach(() => {
  applyZoom(1);
});

describe('nextZoom', () => {
  it('steps by a tenth in each direction', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
  });

  it('resets to 1 on delta 0 whatever the current level', () => {
    expect(nextZoom(0.5, 0)).toBe(1);
    expect(nextZoom(2, 0)).toBe(1);
  });

  it('clamps to 0.5–2', () => {
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.5, -1)).toBe(0.5);
  });

  it('stays on the tenths grid after repeated steps', () => {
    let z = 1;
    for (let i = 0; i < 7; i++) z = nextZoom(z, 1);
    expect(z).toBe(1.7);
    for (let i = 0; i < 12; i++) z = nextZoom(z, -1);
    expect(z).toBe(0.5);
  });
});

describe('zoomLabel', () => {
  it('reads as a whole percentage', () => {
    expect(zoomLabel(1)).toBe('zoom 100%');
    expect(zoomLabel(1.5)).toBe('zoom 150%');
    expect(zoomLabel(0.5)).toBe('zoom 50%');
  });
});

describe('applyZoom / effectiveZoom', () => {
  it('round-trips the level through the body style', () => {
    applyZoom(1.5);
    expect(zoomOf(document.body)).toBe('1.5');
    expect(effectiveZoom()).toBe(1.5);
  });

  it('reads 1 from an untouched element', () => {
    expect(effectiveZoom(document.createElement('div'))).toBe(1);
  });

  it('reads a percentage form', () => {
    const el = document.createElement('div');
    (el.style as CSSStyleDeclaration & { zoom?: string }).zoom = '150%';
    expect(effectiveZoom(el)).toBe(1.5);
  });

  it('falls back to 1 for keywords, junk and non-positive values', () => {
    const el = document.createElement('div');
    const style = el.style as CSSStyleDeclaration & { zoom?: string };
    for (const raw of ['normal', 'reset', 'nonsense', '0', '-1.5', 'NaN', '']) {
      style.zoom = raw;
      expect(effectiveZoom(el), `zoom: ${raw}`).toBe(1);
    }
  });

  it('falls back to 1 when there is no element to read', () => {
    expect(effectiveZoom(null)).toBe(1);
  });
});

describe('toZoomedSpace', () => {
  it('is the identity at zoom 1', () => {
    expect(toZoomedSpace(300, 1)).toBe(300);
  });

  it('divides viewport pixels by the zoom factor', () => {
    expect(toZoomedSpace(450, 1.5)).toBe(300);
    expect(toZoomedSpace(1039 - 18, 1.5)).toBeCloseTo(680.67, 2);
  });

  it('round-trips: a written value renders back at the cursor', () => {
    for (const zoom of [0.5, 0.8, 1, 1.3, 2]) {
      expect(toZoomedSpace(742, zoom) * zoom).toBeCloseTo(742, 6);
    }
  });

  it('leaves pixels alone for a nonsense factor rather than dividing by zero', () => {
    expect(toZoomedSpace(300, 0)).toBe(300);
    expect(toZoomedSpace(300, Number.NaN)).toBe(300);
  });
});

describe('widthAt', () => {
  it('is the rect width plus the pointer travel at zoom 1', () => {
    expect(widthAt(600, 120, 1)).toBe(720);
    expect(widthAt(600, -200, 1)).toBe(400);
  });

  it('converts both the measured start width and the travel', () => {
    // A rect reads 900 viewport px at 150% — 600 in the space the style write lands in.
    expect(widthAt(900, 300, 1.5)).toBe(800);
    expect(widthAt(900, -300, 1.5)).toBe(400);
  });

  it('renders back to the width the cursor drew', () => {
    for (const zoom of [0.5, 1, 1.5, 2]) {
      expect(widthAt(600 * zoom, 90 * zoom, zoom) * zoom).toBeCloseTo((600 + 90) * zoom, 6);
    }
  });
});

// The print path is CSS, not JS: a native print sheet (WKWebView) is raised asynchronously, so
// nothing in JS can reliably restore the zoom after pagination. See print.ts.
describe('print stylesheet', () => {
  it('read the stylesheet at all (extraction proof)', () => {
    expect(appCss.length).toBeGreaterThan(1000);
    expect(appCss).toContain('@media print');
  });

  it('neutralises the body zoom so a forgotten Cmd+- cannot shrink the print', () => {
    const printBlock = appCss.slice(appCss.indexOf('@media print'));
    expect(printBlock).toMatch(/zoom:\s*1\s*!important/);
  });
});
