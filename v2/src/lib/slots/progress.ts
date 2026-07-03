import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import ProgressEdit from './ProgressEdit.svelte';
import ProgressStudy from './ProgressStudy.svelte';

export type ProgressProps = {
  scope: 'section' | 'notebook';
  label?: string;
  show?: {
    mn?: boolean;
    pct?: boolean;
    bar?: boolean;
  };
};

export const progressSlot: SlotType<ProgressProps> = {
  type: 'progress',
  kind: 'track',
  completable: false,

  create(): ProgressProps {
    return {
      scope: 'section',
      label: 'Progress',
      show: { mn: true, pct: true, bar: true },
    };
  },

  variables(_props: ProgressProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return { reads: [], writes: [] };
  },

  validate(props: ProgressProps): string[] {
    if (props.scope !== 'section' && props.scope !== 'notebook') {
      return [`scope must be 'section' or 'notebook', got '${props.scope}'`];
    }
    return [];
  },

  renderEdit: ProgressEdit,
  renderStudy: ProgressStudy,
};
