import { resolveGraph, type GraphNode, type Scope } from './variable-graph';
import { getSlot } from './slots/registry';
import type { Slot } from './types';

/**
 * Resolve a card's reactive scope, driven entirely by each slot's declared
 * variable interface: writes with defaults seed the scope (unless a live input
 * overrides them), slots with evaluate() become graph nodes.
 */
export function buildCardScope(slots: Slot[], inputs: Scope): Scope {
  const seeded: Scope = { ...inputs };
  const nodes: GraphNode[] = [];

  for (const slot of slots) {
    const type = getSlot(slot.type);
    if (!type) continue;
    const { reads, writes } = type.variables(slot.props);

    if (type.evaluate) {
      if (writes.length > 0) {
        nodes.push({
          id: slot.id,
          reads: reads.map((r) => r.key),
          writes: writes.map((w) => w.key),
          evaluate: (scope) => type.evaluate!(slot.props, scope),
        });
      }
      continue;
    }

    for (const w of writes) {
      if (w.default !== undefined && !(w.key in seeded)) {
        seeded[w.key] = w.default as Scope[string];
      }
    }
  }

  return resolveGraph(nodes, seeded);
}
