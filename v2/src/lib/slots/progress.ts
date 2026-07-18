import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import ProgressEdit from './ProgressEdit.svelte';
import ProgressStudy from './ProgressStudy.svelte';

export type ProgressProps = {
  scope: 'section' | 'chapter' | 'notebook';
  label?: string;
  track?: string[];
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
      track: [],
      show: { mn: true, pct: false, bar: true },
    };
  },

  variables(_props: ProgressProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return { reads: [], writes: [] };
  },

  validate(props: ProgressProps): string[] {
    if (props.scope !== 'section' && props.scope !== 'chapter' && props.scope !== 'notebook') {
      return [`scope must be 'section', 'chapter', or 'notebook', got '${props.scope}'`];
    }
    return [];
  },

  renderEdit: ProgressEdit,
  renderStudy: ProgressStudy,
};
