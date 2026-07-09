import { evalExpr } from '../expr';
import type { Scope } from '../variable-graph';

const W = 320, H = 150, L = 44, B = 22, T = 10, R = 12, N = 120;

/** Format a number compactly for an axis label. */
function fmtNum(v: number): string {
  if (!isFinite(v)) return '0';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 10000 || a < 0.001)) return v.toPrecision(3);
  return String(Math.round(v * 1000) / 1000);
}

/** Build an SVG path string for `fn` over x in [x0,x1], with `scope` as parameters. Ported from v1 plotSVG. */
export function plotPath(fn: string, scope: Scope, x0: number, x1: number): { d: string; y0: number; y1: number } {
  const pts: Array<[number, number]> = [];
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < N; i++) {
    const x = x0 + (x1 - x0) * i / (N - 1);
    const raw = evalExpr(fn, { ...scope, x });
    const y = typeof raw === 'number' && isFinite(raw) ? raw : NaN;
    pts.push([x, y]);
    if (isFinite(y)) { if (y < mn) mn = y; if (y > mx) mx = y; }
  }
  if (!(mx > mn)) { mn -= 0.5; mx += 0.5; }
  const y0 = mn, y1 = mx;

  const pw = W - L - R, ph = H - T - B;
  const sx = (x: number): number => L + (x - x0) / (x1 - x0) * pw;
  const sy = (y: number): number => T + (1 - (y - y0) / (y1 - y0)) * ph;

  let d = '', pen = false;
  for (const [x, y] of pts) {
    if (!isFinite(y) || y < y0 || y > y1) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1) + ' ';
    pen = true;
  }
  return { d: d.trim(), y0, y1 };
}

/** Render a full chart SVG for `fn` over [x0,x1]. */
export function plotSVG(fn: string, scope: Scope, x0: number, x1: number): string {
  if (!isFinite(x0)) x0 = 0;
  if (!isFinite(x1) || x1 <= x0) x1 = x0 + 1;
  const pw = W - L - R, ph = H - T - B;
  const { d, y0, y1 } = plotPath(fn, scope, x0, x1);
  const ts = 'font:9px ui-monospace,monospace;fill:var(--muted,#888)';
  return (
    `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="display:block">` +
    `<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="var(--line,#444)"/>` +
    `<text x="${L}" y="${H - 6}" text-anchor="middle" style="${ts}">${fmtNum(x0)}</text>` +
    `<text x="${L + pw}" y="${H - 6}" text-anchor="middle" style="${ts}">${fmtNum(x1)}</text>` +
    `<text x="${L - 4}" y="${T + ph}" text-anchor="end" style="${ts}">${fmtNum(y0)}</text>` +
    `<text x="${L - 4}" y="${T + 9}" text-anchor="end" style="${ts}">${fmtNum(y1)}</text>` +
    `<path d="${d}" fill="none" stroke="var(--accent,#6ea8fe)" stroke-width="2"/>` +
    `</svg>`
  );
}
