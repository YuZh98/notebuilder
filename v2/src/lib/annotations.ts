import type { Annotation } from './types.js';

export type AnnotationMap = Record<string, Annotation[]>;

export function addAnnotation(map: AnnotationMap, a: Annotation): AnnotationMap {
  const bucket = map[a.cardId] ?? [];
  return { ...map, [a.cardId]: [...bucket, a] };
}

export function removeAnnotation(map: AnnotationMap, id: string): AnnotationMap {
  const result: AnnotationMap = {};
  for (const cardId of Object.keys(map)) {
    result[cardId] = map[cardId].filter((a) => a.id !== id);
  }
  return result;
}

export function editAnnotation(map: AnnotationMap, id: string, body: string): AnnotationMap {
  const result: AnnotationMap = {};
  for (const cardId of Object.keys(map)) {
    result[cardId] = map[cardId].map((a) => (a.id === id ? { ...a, body } : a));
  }
  return result;
}

export function annotationsFor(map: AnnotationMap, cardId: string): Annotation[] {
  return map[cardId] ?? [];
}
