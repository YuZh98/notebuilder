import { describe, it, expect } from 'vitest';
import { resolveGraph, type GraphNode, type Scope } from './variable-graph';

const sq = (id: string, src: string, dst: string): GraphNode => ({
  id,
  reads: [src],
  writes: [dst],
  evaluate: (s) => ({ [dst]: (s[src] as number) * (s[src] as number) }),
});

describe('resolveGraph', () => {
  it('resolves a linear chain in dependency order', () => {
    const nodes: GraphNode[] = [
      { id: 'p', reads: ['m'], writes: ['p'], evaluate: (s) => ({ p: (s.m as number) + 1 }) },
      { id: 'm', reads: ['n'], writes: ['m'], evaluate: (s) => ({ m: (s.n as number) * (s.n as number) }) },
    ];
    const out = resolveGraph(nodes, { n: 4 });
    expect(out).toEqual({ n: 4, m: 16, p: 17 });
  });

  it('resolves a diamond dependency', () => {
    const nodes: GraphNode[] = [
      { id: 'd', reads: ['b', 'c'], writes: ['d'], evaluate: (s) => ({ d: (s.b as number) + (s.c as number) }) },
      { id: 'b', reads: ['a'], writes: ['b'], evaluate: (s) => ({ b: (s.a as number) * 2 }) },
      { id: 'c', reads: ['a'], writes: ['c'], evaluate: (s) => ({ c: (s.a as number) * 3 }) },
    ];
    const out = resolveGraph(nodes, { a: 2 });
    expect(out).toEqual({ a: 2, b: 4, c: 6, d: 10 });
  });

  it('throws a clear error on a cycle', () => {
    const nodes: GraphNode[] = [
      { id: 'a', reads: ['b'], writes: ['a'], evaluate: (s) => ({ a: s.b as number }) },
      { id: 'b', reads: ['a'], writes: ['b'], evaluate: (s) => ({ b: s.a as number }) },
    ];
    expect(() => resolveGraph(nodes, {})).toThrow(/Cycle detected/);
  });

  it('treats a read with no writer as undefined-safe (left to inputs)', () => {
    const nodes: GraphNode[] = [
      { id: 'y', reads: ['missing'], writes: ['y'], evaluate: (s) => ({ y: s.missing === undefined ? -1 : (s.missing as number) }) },
    ];
    expect(resolveGraph(nodes, {})).toEqual({ y: -1 });
    expect(resolveGraph(nodes, { missing: 8 })).toEqual({ missing: 8, y: 8 });
  });

  it('is independent of node array order (shuffled yields same result)', () => {
    const base: GraphNode[] = [sq('a', 'n', 'a'), sq('b', 'a', 'b'), sq('c', 'b', 'c')];
    const forward = resolveGraph([base[0], base[1], base[2]], { n: 2 });
    const shuffled = resolveGraph([base[2], base[0], base[1]], { n: 2 });
    expect(forward).toEqual(shuffled);
    expect(forward).toEqual({ n: 2, a: 4, b: 16, c: 256 });
  });

  it('returns inputs unchanged when there are no nodes', () => {
    expect(resolveGraph([], { x: 1 })).toEqual({ x: 1 });
  });
});
