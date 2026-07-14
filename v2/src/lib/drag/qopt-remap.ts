import { remapIndex } from './geometry';

/**
 * Pure reorder + index-remap for qopt drops — v1 90-drag-engine.js:103-106,
 * adapted to v2 shapes: options/items are string[] (v1 joined them with \n),
 * choice answers are already number[] (no legacy scalar in v2), and list
 * done-state is the reader-state boolean[] `checked` (v1 kept a _done Record).
 * `to` is the post-removal insertion index — the engine's t.idx counts grid
 * rows minus the dragged one.
 */

export function reorderItems<T>(items: T[], from: number, to: number): T[] {
  const out = items.slice();
  if (from < 0 || from >= out.length) return out;
  const [moved] = out.splice(from, 1);
  out.splice(Math.min(to, out.length), 0, moved);
  return out;
}

export function remapAnswers(answers: number[], from: number, to: number): number[] {
  return answers.map((a) => remapIndex(a, from, to)).sort((p, q) => p - q);
}

export function remapChecked(checked: boolean[], from: number, to: number): boolean[] {
  const out: boolean[] = [];
  checked.forEach((v, i) => {
    out[remapIndex(i, from, to)] = v === true;
  });
  for (let i = 0; i < out.length; i++) out[i] = out[i] === true;
  return out;
}
