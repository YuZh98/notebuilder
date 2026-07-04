export type Scope = Record<string, number | boolean>;
export type GraphNode = {
  id: string;
  reads: string[];
  writes: string[];
  evaluate(scope: Scope): Scope;
};

/**
 * Topologically order nodes by write -> read dependency, then evaluate each once.
 * A node depends on every node whose writes intersect its reads. Reads with no
 * writer are left to `inputs` (undefined-safe). Cycles throw `Cycle detected: ...`.
 */
export type GraphDecl = { id: string; reads: string[]; writes: string[] };

/**
 * Static analysis of a card's declared variable graph, usable before any
 * evaluation (e.g. at JSON import): reports reads with no writer in the card
 * ("missing dependency", once per variable) and write->read cycles.
 */
export function findGraphIssues(decls: GraphDecl[]): string[] {
  const issues: string[] = [];
  const writers = new Map<string, GraphDecl>();
  for (const d of decls) for (const w of d.writes) writers.set(w, d);

  const missing = new Set<string>();
  for (const d of decls) {
    for (const r of d.reads) {
      if (!writers.has(r)) missing.add(r);
    }
  }
  for (const key of missing) {
    issues.push(`missing dependency: "${key}" is read but never written in the card`);
  }

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const visit = (d: GraphDecl, path: string[]): void => {
    if (visited.has(d.id)) return;
    if (onStack.has(d.id)) {
      issues.push(`cycle detected: ${[...path, d.id].join(' -> ')}`);
      return;
    }
    onStack.add(d.id);
    for (const r of d.reads) {
      const dep = writers.get(r);
      if (dep && dep !== d) visit(dep, [...path, d.id]);
    }
    onStack.delete(d.id);
    visited.add(d.id);
  };
  for (const d of decls) visit(d, []);

  return issues;
}

export function resolveGraph(nodes: GraphNode[], inputs: Scope): Scope {
  const writers = new Map<string, GraphNode>();
  for (const n of nodes) for (const w of n.writes) writers.set(w, n);

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const order: GraphNode[] = [];

  const visit = (n: GraphNode, path: string[]): void => {
    if (visited.has(n.id)) return;
    if (onStack.has(n.id)) {
      throw new Error(`Cycle detected: ${[...path, n.id].join(' -> ')}`);
    }
    onStack.add(n.id);
    for (const r of n.reads) {
      const dep = writers.get(r);
      if (dep && dep !== n) visit(dep, [...path, n.id]);
    }
    onStack.delete(n.id);
    visited.add(n.id);
    order.push(n);
  };

  for (const n of nodes) visit(n, []);

  const scope: Scope = { ...inputs };
  for (const n of order) Object.assign(scope, n.evaluate(scope));
  return scope;
}
