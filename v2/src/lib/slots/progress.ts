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

/**
 * v1 pgShow semantics (60-stage.js:186): the mn (M/N) and bar toggles default
 * on, pct defaults off. Resolves a possibly-undefined show map to concrete flags.
 */
export function pgShow(sh?: { mn?: boolean; pct?: boolean; bar?: boolean }): {
  mn: boolean;
  pct: boolean;
  bar: boolean;
} {
  return {
    mn: !sh || sh.mn !== false,
    pct: !!(sh && sh.pct),
    bar: !sh || sh.bar !== false,
  };
}

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
