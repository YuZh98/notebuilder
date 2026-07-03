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
