import { evalExpr } from '../expr';
import type { Scope } from '../variable-graph';

const W = 320, H = 150, L = 44, B = 22, T = 10, R = 12, N = 120;
const PW = W - L - R, PH = H - T - B;

export type PlotProps = {
  fn: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  xticks?: number;
  yticks?: number;
  hover?: boolean;
};

/** Format a number compactly for an axis label. */
export function fmtNum(v: number): string {
  if (!isFinite(v)) return '0';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 10000 || a < 0.001)) return v.toPrecision(3);
  return String(Math.round(v * 1000) / 1000);
}

/** Sample `fn` over [x0,x1] with `scope` params; returns points plus the finite y extent. */
export function sampleCurve(
  fn: string,
  scope: Scope,
  x0: number,
  x1: number,
): { pts: Array<[number, number]>; mn: number; mx: number } {
  const pts: Array<[number, number]> = [];
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < N; i++) {
    const x = x0 + (x1 - x0) * i / (N - 1);
    const raw = evalExpr(fn, { ...scope, x });
    const y = typeof raw === 'number' && isFinite(raw) ? raw : NaN;
    pts.push([x, y]);
    if (isFinite(y)) { if (y < mn) mn = y; if (y > mx) mx = y; }
  }
  return { pts, mn, mx };
}

/** Fixed y-range when both bounds are finite and y1>y0; otherwise the sampled extent with a ±0.5 pad. */
export function resolveYRange(mn: number, mx: number, y0?: number, y1?: number): { y0: number; y1: number } {
  if (y0 != null && y1 != null && isFinite(y0) && isFinite(y1) && y1 > y0) return { y0, y1 };
  if (!(mx > mn)) { mn -= 0.5; mx += 0.5; }
  return { y0: mn, y1: mx };
}

/** Build the SVG path over the plot rect, breaking (pen-up) wherever y leaves [y0,y1] — no clamping. */
export function buildPath(pts: Array<[number, number]>, x0: number, x1: number, y0: number, y1: number): string {
  const sx = (x: number): number => L + (x - x0) / (x1 - x0) * PW;
  const sy = (y: number): number => T + (1 - (y - y0) / (y1 - y0)) * PH;
  let d = '', pen = false;
  for (const [x, y] of pts) {
    if (!isFinite(y) || y < y0 || y > y1) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1) + ' ';
    pen = true;
  }
  return d.trim();
}

/** Pure hover math: viewBox px → clamped (xv, yv) and the crosshair X. */
export function hoverAt(
  px: number,
  geom: { L: number; pw: number; x0: number; x1: number },
  fn: string,
  scope: Scope,
): { xv: number; yv: number; X: number } {
  let xv = geom.x0 + (px - geom.L) / geom.pw * (geom.x1 - geom.x0);
  xv = Math.max(geom.x0, Math.min(geom.x1, xv));
  const raw = evalExpr(fn, { ...scope, x: xv });
  const yv = typeof raw === 'number' ? raw : NaN;
  const X = geom.L + (xv - geom.x0) / (geom.x1 - geom.x0) * geom.pw;
  return { xv, yv, X };
}

/** Render a full chart SVG from `props` with `scope` as parameters. Ported from v1 plotSVG. */
export function plotSVG(props: PlotProps, scope: Scope): string {
  let x0 = Number(props.x0), x1 = Number(props.x1);
  if (!isFinite(x0)) x0 = 0;
  if (!isFinite(x1) || x1 <= x0) x1 = x0 + 1;

  const { pts, mn, mx } = sampleCurve(props.fn, scope, x0, x1);
  const { y0, y1 } = resolveYRange(mn, mx, props.y0, props.y1);
  const d = buildPath(pts, x0, x1, y0, y1);

  const sx = (x: number): number => L + (x - x0) / (x1 - x0) * PW;
  const sy = (y: number): number => T + (1 - (y - y0) / (y1 - y0)) * PH;
  const ts = 'font:9px ui-monospace,monospace;fill:var(--muted,#888)';
  const parts: string[] = [
    `<rect x="${L}" y="${T}" width="${PW}" height="${PH}" fill="none" stroke="var(--line,#444)"/>`,
  ];

  const xt = Math.round(Number(props.xticks) || 0);
  const yt = Math.round(Number(props.yticks) || 0);

  if (xt >= 1) {
    for (let i = 0; i <= xt; i++) {
      const xv = x0 + (x1 - x0) * i / xt, X = sx(xv).toFixed(1);
      parts.push(`<line x1="${X}" y1="${T}" x2="${X}" y2="${T + PH}" stroke="var(--line,#444)" opacity=".22"/>`);
      parts.push(`<text x="${X}" y="${H - 6}" text-anchor="middle" style="${ts}">${fmtNum(xv)}</text>`);
    }
  } else {
    parts.push(`<text x="${L}" y="${H - 6}" text-anchor="middle" style="${ts}">${fmtNum(x0)}</text>`);
    parts.push(`<text x="${L + PW}" y="${H - 6}" text-anchor="middle" style="${ts}">${fmtNum(x1)}</text>`);
  }

  if (yt >= 1) {
    for (let i = 0; i <= yt; i++) {
      const yv = y0 + (y1 - y0) * i / yt, Y = sy(yv);
      parts.push(`<line x1="${L}" y1="${Y.toFixed(1)}" x2="${L + PW}" y2="${Y.toFixed(1)}" stroke="var(--line,#444)" opacity=".22"/>`);
      parts.push(`<text x="${L - 4}" y="${(Y + 3).toFixed(1)}" text-anchor="end" style="${ts}">${fmtNum(yv)}</text>`);
    }
  } else {
    parts.push(`<text x="${L - 4}" y="${T + PH}" text-anchor="end" style="${ts}">${fmtNum(y0)}</text>`);
    parts.push(`<text x="${L - 4}" y="${T + 9}" text-anchor="end" style="${ts}">${fmtNum(y1)}</text>`);
  }

  const hv = !!props.hover;
  const cur = hv
    ? `<line class="chart-cur" y1="${T}" y2="${T + PH}" stroke="var(--accent,#6ea8fe)" stroke-dasharray="3 3" style="display:none"/>` +
      `<text class="chart-val" y="${T + 11}" style="font:10px ui-monospace,monospace;fill:var(--accent,#6ea8fe);display:none"></text>`
    : '';
  const data = hv
    ? ` data-hover="1" data-x0="${x0}" data-x1="${x1}" data-y0="${y0}" data-y1="${y1}"` +
      ` data-l="${L}" data-pw="${PW}" data-t="${T}" data-ph="${PH}"`
    : '';

  return (
    `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="display:block;cursor:${hv ? 'crosshair' : 'default'}"${data}>` +
    parts.join('') +
    `<path d="${d}" fill="none" stroke="var(--accent,#6ea8fe)" stroke-width="2"/>` +
    cur +
    `</svg>`
  );
}
