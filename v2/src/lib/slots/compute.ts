import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import type { Scope } from '../variable-graph';
import { evalExpr } from '../expr';
import { extractReads } from './identifiers';
import ComputeEdit from './ComputeEdit.svelte';
import ComputeStudy from './ComputeStudy.svelte';

export type ComputeProps = {
  expr: string;
  out: string;
  note?: string;
};

export const computeSlot: SlotType<ComputeProps> = {
  type: 'compute',
  kind: 'compute',
  completable: false,

  create(): ComputeProps {
    return { expr: '', out: '', note: '' };
  },

  variables(props: ComputeProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    const reads = extractReads(props.expr).map((key) => ({ key, type: 'number' as const }));
    return { reads, writes: props.out ? [{ key: props.out, type: 'number' }] : [] };
  },

  evaluate(props: ComputeProps, scope: Scope): Scope {
    return props.out ? { [props.out]: evalExpr(props.expr, scope) } : {};
  },

  validate(props: ComputeProps): string[] {
    const errors: string[] = [];
    if (typeof props.expr !== 'string') errors.push('expr must be a string');
    return errors;
  },

  renderEdit: ComputeEdit,
  renderStudy: ComputeStudy,
};
