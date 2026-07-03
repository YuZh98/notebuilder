import { evalExpr } from './expr';
import { resolveGraph, type GraphNode, type Scope } from './variable-graph';
import { getSlot } from './slots/registry';
import type { Slot } from './types';

/** Resolve a card's reactive scope: sliders seed inputs, compute/chart writers evaluate via the graph. */
export function buildCardScope(slots: Slot[], inputs: Scope): Scope {
  const seeded: Scope = { ...inputs };
  const nodes: GraphNode[] = [];

  for (const slot of slots) {
    const type = getSlot(slot.type);
    if (!type) continue;
    const { reads, writes } = type.variables(slot.props);

    if (slot.type === 'slider') {
      const key = String(slot.props.key ?? '');
      if (key && !(key in seeded)) seeded[key] = Number(slot.props.value) || 0;
      continue;
    }

    if (slot.type === 'compute') {
      const expr = String(slot.props.expr ?? '');
      const out = String(slot.props.out ?? '');
      if (!out) continue;
      nodes.push({
        id: slot.id,
        reads: reads.map((r) => r.key),
        writes: [out],
        evaluate: (scope) => ({ [out]: evalExpr(expr, scope) }),
      });
    }
  }

  return resolveGraph(nodes, seeded);
}
