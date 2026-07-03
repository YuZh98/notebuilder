import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import CodeEdit from './CodeEdit.svelte';
import CodeStudy from './CodeStudy.svelte';

export type CodeProps = {
  code: string;
  lang?: string;
};

export const codeSlot: SlotType<CodeProps> = {
  type: 'code',
  kind: 'write',
  completable: false,

  create(): CodeProps {
    return { code: '' };
  },

  variables(_props: CodeProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return { reads: [], writes: [] };
  },

  validate(props: CodeProps): string[] {
    const errors: string[] = [];
    if (typeof props.code !== 'string') errors.push('code must be a string');
    return errors;
  },

  renderEdit: CodeEdit,
  renderStudy: CodeStudy,
};
