import type { SlotType } from '../slot-contract';
import type { VarDeclaration } from '../types';
import ImageEdit from './ImageEdit.svelte';
import ImageStudy from './ImageStudy.svelte';

export type ImageProps = {
  src: string;
  alt?: string;
};

const ALLOWED_SCHEMES = ['data:', 'https:', 'http:', 'file:'];

export const imageSlot: SlotType<ImageProps> = {
  type: 'image',
  kind: 'write',
  completable: false,

  create(): ImageProps {
    return { src: '', alt: '' };
  },

  variables(_props: ImageProps): { reads: VarDeclaration[]; writes: VarDeclaration[] } {
    return { reads: [], writes: [] };
  },

  validate(props: ImageProps): string[] {
    const errors: string[] = [];
    if (typeof props.src !== 'string') {
      errors.push('src must be a string');
      return errors;
    }
    if (props.src !== '' && !ALLOWED_SCHEMES.some((s) => props.src.toLowerCase().startsWith(s))) {
      errors.push('src must use a data:, https:, http:, or file: scheme');
    }
    return errors;
  },

  renderEdit: ImageEdit,
  renderStudy: ImageStudy,
};
