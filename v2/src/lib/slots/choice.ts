import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import ChoiceEdit from './ChoiceEdit.svelte';
import ChoiceStudy from './ChoiceStudy.svelte';

export type ChoiceProps = {
  options: string[];
  answer?: number[];
  multi?: boolean;
  /** Prompt rendered above the options (markdown-capable via the text pipeline). */
  q?: string;
  /** Revealed in Study once the reader has answered — right or wrong (v1 20-registries:43). */
  explanation?: string;
};

export const choiceSlot: SlotType<ChoiceProps> = {
  type: 'choice',
  kind: 'interact',
  completable: true,

  create(): ChoiceProps {
    return { options: ['', ''], answer: [], multi: false };
  },

  variables(_props: ChoiceProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return { reads: [], writes: [] };
  },

  isDone(_props: ChoiceProps, state: Record<string, unknown>): boolean {
    return state.submitted === true;
  },

  validate(props: ChoiceProps): string[] {
    const errors: string[] = [];

    if (!Array.isArray(props.options)) {
      errors.push('options must be an array of strings');
      return errors;
    }

    if (props.options.length < 2) {
      errors.push('options must have at least 2 items');
    }

    const answer = props.answer ?? [];
    for (const idx of answer) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= props.options.length) {
        errors.push(`answer index ${idx} is out of range`);
      }
    }

    return errors;
  },

  renderEdit: ChoiceEdit,
  renderStudy: ChoiceStudy,
};
