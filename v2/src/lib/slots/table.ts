import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import TableEdit from './TableEdit.svelte';
import TableStudy from './TableStudy.svelte';

export type TableProps = {
  rows: string[][];
};

export const tableSlot: SlotType<TableProps> = {
  type: 'table',
  kind: 'write',
  completable: false,

  create(): TableProps {
    return { rows: [['', ''], ['', '']] };
  },

  variables(_props: TableProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return { reads: [], writes: [] };
  },

  validate(props: TableProps): string[] {
    const errors: string[] = [];
    if (!Array.isArray(props.rows)) {
      errors.push('rows must be an array');
      return errors;
    }
    let cols: number | null = null;
    for (const row of props.rows) {
      if (!Array.isArray(row)) {
        errors.push('each row must be an array');
        return errors;
      }
      if (!row.every((cell) => typeof cell === 'string')) {
        errors.push('each cell must be a string');
        return errors;
      }
      if (cols === null) cols = row.length;
      else if (row.length !== cols) {
        errors.push('all rows must have the same number of columns');
        return errors;
      }
    }
    return errors;
  },

  renderEdit: TableEdit,
  renderStudy: TableStudy,
};
