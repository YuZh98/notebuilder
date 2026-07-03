import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import TextEdit from './TextEdit.svelte';
import TextStudy from './TextStudy.svelte';

export type TextProps = {
  text: string;
};

export const textSlot: SlotType<TextProps> = {
  type: 'text',
  kind: 'write',
  completable: false,

  create(): TextProps {
    return { text: '' };
  },

  variables(props: TextProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    // Extract {{var}} references from text
    const reads: VarDeclaration[] = [];
    const matches = props.text.matchAll(/\{\{(\w+)\}\}/g);
    for (const m of matches) {
      reads.push({ key: m[1], type: 'string' });
    }
    return { reads, writes: [] };
  },

  validate(props: TextProps): string[] {
    const errors: string[] = [];
    if (typeof props.text !== 'string') errors.push('text must be a string');
    return errors;
  },

  renderEdit: TextEdit,
  renderStudy: TextStudy,
};
