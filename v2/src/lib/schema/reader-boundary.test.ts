/**
 * The Reader bundle (reader-main.ts → json-io.ts) must not grow by the schema or the AI kit:
 * walk json-io.ts's static import graph over the sources and assert none of them is reached.
 */
import { describe, it, expect } from 'vitest';

const sources = import.meta.glob(['/src/lib/**/*.ts', '/src/lib/**/*.svelte', '!/src/lib/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FORBIDDEN = /\/(schema\/|ai-prompt|import-hints|slot-catalog|clipboard)/;

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // packages are not ours to police here
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const base = parts.join('/');
  for (const cand of [base, `${base}.ts`, `${base}/index.ts`]) if (cand in sources) return cand;
  return base; // e.g. a .json file: still checked against FORBIDDEN
}

function importGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = sources[file];
    if (!src) continue;
    for (const m of src.matchAll(/(?:^|\n)\s*import\s+(?!type\b)[^'"]*?['"]([^'"]+)['"]/g)) {
      const dep = resolve(file, m[1]);
      if (dep) queue.push(dep);
    }
  }
  return seen;
}

describe('Reader bundle boundary', () => {
  it('found the sources (extraction proof)', () => {
    expect(Object.keys(sources)).toContain('/src/lib/json-io.ts');
    expect(Object.keys(sources)).toContain('/src/lib/import-hints.ts');
  });

  it('json-io.ts never reaches the schema, the AI prompt kit or the import hints', () => {
    const graph = importGraph('/src/lib/json-io.ts');
    expect(graph.size).toBeGreaterThan(5); // walked into the slot registry
    const leaks = [...graph].filter((f) => FORBIDDEN.test(f));
    expect(leaks, `json-io.ts now imports ${leaks.join(', ')}; keep it out of the Reader bundle`).toEqual([]);
  });

  it('the walker does see the kit from its real importers (no false negative)', () => {
    expect([...importGraph('/src/lib/components/FromAiModal.svelte')].some((f) => FORBIDDEN.test(f))).toBe(true);
  });
});
