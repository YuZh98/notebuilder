// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  addAnnotation,
  removeAnnotation,
  editAnnotation,
  annotationsFor,
} from './annotations.js';
import type { AnnotationMap } from './annotations.js';
import type { Annotation } from './types.js';

const a1: Annotation = {
  id: 'ann-1',
  cardId: 'card-A',
  kind: 'note',
  body: 'First note',
  createdAt: '2026-01-01T00:00:00Z',
};

const a2: Annotation = {
  id: 'ann-2',
  cardId: 'card-A',
  kind: 'highlight',
  body: 'Highlighted text',
  createdAt: '2026-01-02T00:00:00Z',
};

const a3: Annotation = {
  id: 'ann-3',
  cardId: 'card-B',
  kind: 'note',
  body: 'Note on card B',
  createdAt: '2026-01-03T00:00:00Z',
};

describe('addAnnotation', () => {
  it('creates a new card bucket and appends the annotation', () => {
    const empty: AnnotationMap = {};
    const result = addAnnotation(empty, a1);
    expect(result['card-A']).toEqual([a1]);
  });

  it('appends a second annotation to the same card', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    const result = addAnnotation(map, a2);
    expect(result['card-A']).toEqual([a1, a2]);
  });

  it('handles annotations on different cards independently', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    const result = addAnnotation(map, a3);
    expect(result['card-A']).toEqual([a1]);
    expect(result['card-B']).toEqual([a3]);
  });
});

describe('removeAnnotation', () => {
  it('removes an annotation by id from the correct card', () => {
    const map: AnnotationMap = { 'card-A': [a1, a2], 'card-B': [a3] };
    const result = removeAnnotation(map, 'ann-1');
    expect(result['card-A']).toEqual([a2]);
    expect(result['card-B']).toEqual([a3]);
  });

  it('leaves an empty array when the last annotation on a card is removed', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    const result = removeAnnotation(map, 'ann-1');
    expect(result['card-A']).toEqual([]);
  });

  it('is a no-op when the id does not exist', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    const result = removeAnnotation(map, 'no-such-id');
    expect(result['card-A']).toEqual([a1]);
  });
});

describe('editAnnotation', () => {
  it('updates the body of the target annotation', () => {
    const map: AnnotationMap = { 'card-A': [a1, a2] };
    const result = editAnnotation(map, 'ann-1', 'Updated body');
    const edited = result['card-A'].find((a) => a.id === 'ann-1');
    expect(edited?.body).toBe('Updated body');
  });

  it('leaves other annotations unchanged', () => {
    const map: AnnotationMap = { 'card-A': [a1, a2], 'card-B': [a3] };
    const result = editAnnotation(map, 'ann-1', 'Changed');
    const untouched = result['card-A'].find((a) => a.id === 'ann-2');
    expect(untouched).toEqual(a2);
    expect(result['card-B']).toEqual([a3]);
  });

  it('is a no-op when the id does not exist', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    const result = editAnnotation(map, 'no-such-id', 'x');
    expect(result['card-A']).toEqual([a1]);
  });
});

describe('annotationsFor', () => {
  it('returns annotations for a card that exists', () => {
    const map: AnnotationMap = { 'card-A': [a1, a2] };
    expect(annotationsFor(map, 'card-A')).toEqual([a1, a2]);
  });

  it('returns an empty array for a card with no annotations', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    expect(annotationsFor(map, 'card-B')).toEqual([]);
  });

  it('returns an empty array for an empty map', () => {
    expect(annotationsFor({}, 'card-X')).toEqual([]);
  });
});

describe('immutability', () => {
  it('addAnnotation does not mutate the input map', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    const original = structuredClone(map);
    addAnnotation(map, a2);
    expect(map).toEqual(original);
  });

  it('removeAnnotation does not mutate the input map', () => {
    const map: AnnotationMap = { 'card-A': [a1, a2] };
    const original = structuredClone(map);
    removeAnnotation(map, 'ann-1');
    expect(map).toEqual(original);
  });

  it('editAnnotation does not mutate the input map', () => {
    const map: AnnotationMap = { 'card-A': [a1] };
    const original = structuredClone(map);
    editAnnotation(map, 'ann-1', 'Changed body');
    expect(map).toEqual(original);
  });
});