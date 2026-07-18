import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import { extractReads } from './identifiers';
import ChartEdit from './ChartEdit.svelte';
import ChartStudy from './ChartStudy.svelte';

export type ChartProps = {
  fn: string;
  label?: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  xticks?: number;
  yticks?: number;
  hover?: boolean;
};

const X_AXIS = new Set(['x']);

export const chartSlot: SlotType<ChartProps> = {
  type: 'chart',
  kind: 'compute',
  completable: false,

  create(): ChartProps {
    return { fn: 'x', x0: 0, x1: 10, y0: 0, y1: 10, xticks: 5, yticks: 5, hover: true, label: '' };
  },

  variables(props: ChartProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    const reads = extractReads(props.fn, X_AXIS).map((key) => ({ key, type: 'number' as const }));
    return { reads, writes: [] };
  },

  validate(props: ChartProps): string[] {
    const errors: string[] = [];
    if (typeof props.fn !== 'string') errors.push('fn must be a string');
    return errors;
  },

  renderEdit: ChartEdit,
  renderStudy: ChartStudy,
};
