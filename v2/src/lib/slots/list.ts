import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import ListEdit from './ListEdit.svelte';
import ListStudy from './ListStudy.svelte';

export type ListStyle = 'bullets' | 'numbered' | 'check';

export type ListProps = {
  items: string[];
  style: ListStyle;
};

const VALID_STYLES: ListStyle[] = ['bullets', 'numbered', 'check'];

export const listSlot: SlotType<ListProps> = {
  type: 'list',
  kind: 'write',
  completable: true,

  create(): ListProps {
    return { items: [''], style: 'bullets' };
  },

  variables(_props: ListProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return { reads: [], writes: [] };
  },

  validate(props: ListProps): string[] {
    const errors: string[] = [];
    if (!Array.isArray(props.items) || !props.items.every((i) => typeof i === 'string')) {
      errors.push('items must be a string[]');
    }
    if (!VALID_STYLES.includes(props.style)) {
      errors.push('style must be one of: bullets, numbered, check');
    }
    return errors;
  },

  isDone(props: ListProps, state: Record<string, unknown>): boolean {
    // Non-checklist lists are content slots — always considered done.
    if (props.style !== 'check') return true;
    // A check list with zero items has nothing left to tick: vacuously done.
    if (props.items.length === 0) return true;
    // Check style: every item must be checked in reader state.
    const checked = state.checked;
    if (!Array.isArray(checked)) return false;
    return props.items.every((_item, i) => checked[i] === true);
  },

  renderEdit: ListEdit,
  renderStudy: ListStudy,
};
