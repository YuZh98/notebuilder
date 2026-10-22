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

const indexSet = (v: unknown): Set<number> =>
  new Set(Array.isArray(v) ? v.filter((i): i is number => Number.isInteger(i)) : []);

/**
 * Whole-answer correctness: the reader's selection equals the answer key as a set. `null` means
 * ungraded — the author gave no answer key (missing or empty), so there is nothing to be right
 * about. Independent of `submitted`; callers decide whether a pending pick counts.
 */
export function isChoiceCorrect(props: ChoiceProps, state: Record<string, unknown> | undefined): boolean | null {
  const answer = indexSet(props.answer);
  if (answer.size === 0) return null;
  const selected = indexSet(state?.selected);
  if (selected.size !== answer.size) return false;
  for (const i of selected) if (!answer.has(i)) return false;
  return true;
}

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

  // Only a submitted answer counts: a correct-but-pending pick is neither answered nor correct.
  score(props: ChoiceProps, state: Record<string, unknown> | undefined) {
    const verdict = isChoiceCorrect(props, state);
    if (verdict === null) return null;
    const answered = state?.submitted === true;
    return { correct: answered && verdict ? 1 : 0, answered: answered ? 1 : 0 };
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
