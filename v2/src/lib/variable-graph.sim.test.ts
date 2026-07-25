import { describe, it, expect } from 'vitest';
import { findGraphIssues, resolveGraph, type GraphDecl, type GraphNode, type Scope } from './variable-graph';
import { buildCardScope } from './card-scope';
import { makeRng, SEEDS, type Rng } from './sim-rng';
import type { Slot } from './types';

/** Generated graphs per property, per seed. Kept small — CI budget is seconds. */
const CASES = 40;

type SimGraph = { decls: GraphDecl[]; nodes: GraphNode[] };

const num = (v: unknown): number => (typeof v === 'number' ? v : v === true ? 1 : 0);

/**
 * A random DAG with a unique writer per variable. Node `i` may only read
 * variables written by nodes `j < i`, so the write->read graph is acyclic by
 * construction, and every read has a writer.
 */
function genDag(r: Rng, n: number): SimGraph {
  const decls: GraphDecl[] = [];
  const nodes: GraphNode[] = [];
  const pool: string[] = [];

  for (let i = 0; i < n; i++) {
    const writes = [`v${i}`];
    if (r.bool(0.25)) writes.push(`w${i}`);
    const reads = r.sample(pool, r.int(Math.min(pool.length, 3) + 1));
    const coef = r.between(1, 9);
    decls.push({ id: `n${i}`, reads, writes });
    nodes.push({
      id: `n${i}`,
      reads,
      writes,
      evaluate: (s: Scope) => {
        const base = reads.reduce((acc, k) => acc + coef * num(s[k]), coef);
        return Object.fromEntries(writes.map((w, wi) => [w, base + wi]));
      },
    });
    pool.push(...writes);
  }
  return { decls, nodes };
}

/**
 * Force a cycle of length k >= 2 by wiring a ring of read edges between k
 * distinct nodes. Self-reads are deliberately excluded: `findGraphIssues` and
 * `resolveGraph` both skip the `dep === node` edge, so a one-node ring is not a
 * cycle by design (a slot that reads and writes the same key is legal).
 */
function injectCycle(r: Rng, g: SimGraph): string[] {
  const idx = r.sample(
    g.decls.map((_, i) => i),
    r.between(2, Math.min(4, g.decls.length)),
  );
  for (let t = 0; t < idx.length; t++) {
    const from = idx[t];
    const to = idx[(t + 1) % idx.length];
    const key = g.decls[to].writes[0];
    if (!g.decls[from].reads.includes(key)) {
      g.decls[from].reads.push(key);
      g.nodes[from].reads.push(key);
    }
  }
  return idx.map((i) => g.decls[i].id);
}

/** Add reads of variables nobody writes. Returns the ghost variable names. */
function injectMissing(r: Rng, g: SimGraph, count: number): string[] {
  const ghosts: string[] = [];
  for (let i = 0; i < count; i++) {
    const ghost = `ghost${i}`;
    const d = g.decls[r.int(g.decls.length)];
    if (!d.reads.includes(ghost)) d.reads.push(ghost);
    ghosts.push(ghost);
  }
  return ghosts;
}

const cycleIssues = (issues: string[]): string[] => issues.filter((s) => s.startsWith('cycle detected'));
const missingIssues = (issues: string[]): string[] =>
  issues.filter((s) => s.startsWith('missing dependency'));

describe.each(SEEDS)('findGraphIssues simulation (seed %i)', (seed) => {
  it('reports nothing for a DAG whose every read has a writer', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const g = genDag(r, r.between(1, 12));
      expect(findGraphIssues(r.shuffle(g.decls)), `seed ${seed} case ${c}`).toEqual([]);
    }
  });

  it('reports every injected cycle, under any declaration order', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const g = genDag(r, r.between(2, 12));
      const ring = injectCycle(r, g);
      const where = `seed ${seed} case ${c} ring ${ring.join(',')}`;
      for (let s = 0; s < 3; s++) {
        expect(cycleIssues(findGraphIssues(r.shuffle(g.decls))).length, where).toBeGreaterThan(0);
      }
    }
  });

  it('reports each unwritten read exactly once, order-independently', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const g = genDag(r, r.between(1, 10));
      const ghosts = injectMissing(r, g, r.between(1, 3));
      const where = `seed ${seed} case ${c}`;
      const expected = [...new Set(ghosts)]
        .map((k) => `missing dependency: "${k}" is read but never written in the card`)
        .sort();
      for (let s = 0; s < 3; s++) {
        const issues = findGraphIssues(r.shuffle(g.decls));
        expect(missingIssues(issues).sort(), where).toEqual(expected);
        expect(cycleIssues(issues), where).toEqual([]);
      }
    }
  });

  it('never reports a cycle for an acyclic graph, however it is shuffled', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const g = genDag(r, r.between(1, 14));
      injectMissing(r, g, r.int(3));
      for (let s = 0; s < 3; s++) {
        expect(cycleIssues(findGraphIssues(r.shuffle(g.decls))), `seed ${seed} case ${c}`).toEqual([]);
      }
    }
  });
});

describe.each(SEEDS)('resolveGraph simulation (seed %i)', (seed) => {
  it('produces the same scope for every node ordering', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const g = genDag(r, r.between(1, 12));
      const inputs: Scope = { seedIn: r.between(-5, 5) };
      const where = `seed ${seed} case ${c}`;
      const base = resolveGraph(g.nodes, inputs);
      for (let s = 0; s < 4; s++) {
        expect(resolveGraph(r.shuffle(g.nodes), inputs), where).toEqual(base);
      }
    }
  });

  it('is deterministic and leaves inputs it does not write intact', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const g = genDag(r, r.between(1, 12));
      const inputs: Scope = { keepMe: r.between(-9, 9), flagMe: r.bool() };
      const where = `seed ${seed} case ${c}`;
      const a = resolveGraph(g.nodes, inputs);
      const b = resolveGraph(g.nodes, inputs);
      expect(b, where).toEqual(a);
      expect(a.keepMe, where).toBe(inputs.keepMe);
      expect(a.flagMe, where).toBe(inputs.flagMe);
      for (const n of g.nodes) {
        for (const w of n.writes) expect(w in a, `${where} write ${w}`).toBe(true);
      }
    }
  });

  it('throws on every injected cycle, under any node ordering', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const g = genDag(r, r.between(2, 12));
      injectCycle(r, g);
      for (let s = 0; s < 3; s++) {
        const shuffled = r.shuffle(g.nodes);
        expect(() => resolveGraph(shuffled, {}), `seed ${seed} case ${c}`).toThrow(/Cycle detected/);
      }
    }
  });
});

/** Identifiers safe to use as variable keys: none collide with evalExpr's builtins. */
const KEY_POOL = ['aa', 'ab', 'ac', 'ad', 'ba', 'bb', 'bc', 'bd', 'ca', 'cb', 'cc', 'cd'];

/** A random arithmetic expression over `vars` (empty `vars` yields a literal). */
function genExpr(r: Rng, vars: string[], depth = 0): string {
  if (vars.length === 0) return String(r.between(1, 20));
  if (depth >= 2 || r.bool(0.35)) return r.bool(0.75) ? r.pick(vars) : String(r.between(1, 20));
  const a = genExpr(r, vars, depth + 1);
  const b = genExpr(r, vars, depth + 1);
  switch (r.int(6)) {
    case 0: return `(${a} + ${b})`;
    case 1: return `(${a} - ${b})`;
    case 2: return `(${a} * ${b})`;
    case 3: return `min(${a}, ${b})`;
    case 4: return `sqrt(abs(${a}))`;
    default: return `(${a} > ${b} ? ${a} : ${b})`;
  }
}

/**
 * A random card of slider (scope seeds) and compute (graph nodes) slots. Keys
 * are allocated once from a shared pool so every variable has exactly one
 * writer, and each compute reads only keys allocated before it — the card graph
 * is therefore acyclic by construction.
 */
function genScopeSlots(r: Rng): Slot[] {
  const slots: Slot[] = [];
  const keys = r.shuffle(KEY_POOL);
  const declared: string[] = [];
  let ki = 0;
  const count = r.between(1, 8);
  for (let i = 0; i < count && ki < keys.length; i++) {
    const key = keys[ki++];
    if (r.bool(0.45)) {
      slots.push({
        id: `slot${i}`,
        type: 'slider',
        props: { key, value: r.between(-20, 20), min: -100, max: 100, step: 1 },
      });
    } else {
      slots.push({
        id: `slot${i}`,
        type: 'compute',
        props: { expr: genExpr(r, declared), out: key },
      });
    }
    declared.push(key);
  }
  return slots;
}

describe.each(SEEDS)('buildCardScope simulation (seed %i)', (seed) => {
  it('resolves the same scope for every slot ordering', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const slots = genScopeSlots(r);
      const inputs: Scope = r.bool() ? {} : { live: r.between(-5, 5) };
      const where = `seed ${seed} case ${c}`;
      const base = buildCardScope(slots, inputs);
      for (let s = 0; s < 4; s++) {
        expect(buildCardScope(r.shuffle(slots), inputs), where).toEqual(base);
      }
      for (const slot of slots) {
        const key = slot.props.key ?? slot.props.out;
        expect(key as string in base, `${where} key ${String(key)}`).toBe(true);
      }
    }
  });
});
