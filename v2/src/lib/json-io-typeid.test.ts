import { describe, it, expect } from 'vitest';
import { exportNotebook, importNotebook, validateNotebook } from './json-io';
import Ajv2020 from 'ajv/dist/2020';
import schema from './schema/notebook.schema.json';

const validate = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(schema);
const validateAgainstSchema = (json: unknown): string[] =>
  validate(json) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);

const doc = (card: Record<string, unknown>) => ({
  version: 2,
  notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots: [{ type: 'text', props: { text: 'x' } }], ...card }] }] },
});

describe('Card.typeId in the interchange format', () => {
  it('round-trips and is accepted by the validator and the published schema', () => {
    const json = doc({ typeId: 'ct_quiz' });
    expect(validateNotebook(json).errors).toEqual([]);
    expect(validateAgainstSchema(json)).toEqual([]);
    expect(exportNotebook(importNotebook(json as never)).notebook.sections[0].cards[0]).toMatchObject({ typeId: 'ct_quiz' });
  });

  it('a non-string typeId is rejected with a path, never imported', () => {
    const { errors } = validateNotebook(doc({ typeId: 42 }));
    expect(errors.some((e) => /cards\[0\]\.typeId must be a string/.test(e))).toBe(true);
    expect(validateAgainstSchema(doc({ typeId: 42 })).length).toBeGreaterThan(0);
  });
});
