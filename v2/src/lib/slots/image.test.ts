// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { imageSlot } from './image';

describe('imageSlot', () => {
  describe('create', () => {
    it('returns default props with empty src and alt', () => {
      const props = imageSlot.create();
      expect(props).toEqual({ src: '', alt: '' });
    });
  });

  describe('variables', () => {
    it('returns empty reads/writes', () => {
      const result = imageSlot.variables({ src: 'data:image/png;base64,AAAA', alt: 'x' });
      expect(result).toEqual({ reads: [], writes: [] });
    });
  });

  describe('validate', () => {
    it('passes for empty src', () => {
      const errors = imageSlot.validate!({ src: '' });
      expect(errors).toEqual([]);
    });

    it('passes for a valid data: URL', () => {
      const errors = imageSlot.validate!({
        src: 'data:image/png;base64,iVBORw0KGgo=',
        alt: 'pixel',
      });
      expect(errors).toEqual([]);
    });

    it('passes for https:, http:, and file: schemes', () => {
      expect(imageSlot.validate!({ src: 'https://example.com/a.png' })).toEqual([]);
      expect(imageSlot.validate!({ src: 'http://example.com/a.png' })).toEqual([]);
      expect(imageSlot.validate!({ src: 'file:///tmp/a.png' })).toEqual([]);
    });

    it('fails if src is not a string', () => {
      const errors = imageSlot.validate!({ src: 123 as unknown as string });
      expect(errors).toContain('src must be a string');
    });

    it('rejects a javascript: src (security guard)', () => {
      const errors = imageSlot.validate!({ src: 'javascript:alert(1)' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('src must use a data:, https:, http:, or file: scheme');
    });

    it('rejects an unknown scheme', () => {
      const errors = imageSlot.validate!({ src: 'ftp://example.com/a.png' });
      expect(errors).toContain('src must use a data:, https:, http:, or file: scheme');
    });
  });

  describe('metadata', () => {
    it('is a write slot', () => {
      expect(imageSlot.kind).toBe('write');
    });

    it('is not completable', () => {
      expect(imageSlot.completable).toBe(false);
    });

    it('has type "image"', () => {
      expect(imageSlot.type).toBe('image');
    });
  });
});