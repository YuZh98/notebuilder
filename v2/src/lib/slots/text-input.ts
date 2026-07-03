import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import TextInputEdit from './TextInputEdit.svelte';
import TextInputStudy from './TextInputStudy.svelte';

export type TextInputProps = {
  placeholder?: string;
  key?: string;
};

export type TextInputState = {
  value: string;
};

export const textInputSlot: SlotType<TextInputProps> = {
  type: 'text-input',
  kind: 'interact',
  completable: true,

  create(): TextInputProps {
    return {};
  },

  variables(_props: TextInputProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    // NOTE: text-input value is a string; it does not participate in the numeric variable
    // graph this round. Wiring string state into Scope (number|boolean) is deferred.
    return { reads: [], writes: [] };
  },

  isDone(_props: TextInputProps, state: Record<string, unknown>): boolean {
    return typeof state.value === 'string' && state.value.trim() !== '';
  },

  validate(_props: TextInputProps): string[] {
    return [];
  },

  renderEdit: TextInputEdit,
  renderStudy: TextInputStudy,
};
