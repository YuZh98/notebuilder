/**
 * Schema sync: the published JSON Schema (notebook.schema.json) and the app's own validator
 * (validateNotebook) must agree. Everything the app produces passes both; every structural
 * defect is rejected by both; semantic defects the schema cannot express are rejected by the
 * validator alone (and the schema is asserted to let them through, so the boundary is explicit).
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import schema from './notebook.schema.json';
import { exportNotebook, validateNotebook } from '../json-io';
import { demoNotebook } from '../demo';
import { builtinCardTypes, stampCard } from '../card-types';
import { allSlots } from '../slots/registry';
import type { Notebook } from '../types';

// allowUnionTypes: `"type": [..]` is valid 2020-12; ajv strict mode merely flags it as a style choice.
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateSchema = ajv.compile(schema);

function schemaErrors(json: unknown): string[] {
  return validateSchema(json) ? [] : (validateSchema.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

/**
 * No validator errors and no schema errors. `strict` also forbids warnings (cross-card reads) —
 * used for documentation examples, which must model good practice; app content only has to import.
 */
function expectValidBoth(json: unknown, label: string, strict = false): void {
  const { errors, warnings } = validateNotebook(json);
  expect(errors, `${label}: validateNotebook errors`).toEqual([]);
  if (strict) expect(warnings, `${label}: validateNotebook warnings`).toEqual([]);
  expect(schemaErrors(json), `${label}: schema errors`).toEqual([]);
}

// cwd is v2/ under vitest. release-notes.json is the legacy v1 prototype format ({ name, rooms[] }).
const EXAMPLES_DIR = '../docs/examples';
const LEGACY_EXAMPLES = new Set(['release-notes.json']);
const examples: string[] = (readdirSync(EXAMPLES_DIR) as string[]).filter(
  (f) => f.endsWith('.json') && !LEGACY_EXAMPLES.has(f),
);

/** A notebook holding one stamped card of every built-in card type. */
function builtinTypesNotebook(): Notebook {
  const sectionId = 'sec_types';
  return {
    id: 'nb_types',
    name: 'Every built-in card type',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: sectionId,
        notebookId: 'nb_types',
        name: 'Types',
        position: 0,
        cards: builtinCardTypes.map((ct, i) => stampCard(ct, sectionId, i)),
      },
    ],
  };
}

describe('the schema itself', () => {
  it('compiles under ajv strict mode (no unknown keywords, no typos)', () => {
    expect(typeof validateSchema).toBe('function');
  });

  it('declares every registered slot type in the enum, $defs and an if/then branch — and nothing stale', () => {
    const slotDef = schema.$defs.slot;
    const enumTypes: string[] = slotDef.properties.type.enum;
    const branchTypes = slotDef.allOf.map((b) => b.if.properties.type.const);
    const defs = Object.keys(schema.$defs);
    const propsDefName = (t: string) => `${t.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase())}Props`;
    for (const { type } of allSlots()) {
      expect(enumTypes, `slot type "${type}" is registered but missing from $defs.slot.properties.type.enum`).toContain(type);
      expect(branchTypes, `slot type "${type}" has no if/then branch in $defs.slot.allOf`).toContain(type);
      expect(defs, `slot type "${type}" has no $defs.${propsDefName(type)}`).toContain(propsDefName(type));
    }
    const registered = allSlots().map((s) => s.type);
    for (const t of enumTypes) expect(registered, `schema lists "${t}" but no such slot is registered`).toContain(t);
    expect(new Set(branchTypes).size).toBe(branchTypes.length);
  });

  it('accepts a fresh slot of every registered type (each create() default)', () => {
    for (const st of allSlots()) {
      const json = {
        version: 2,
        notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots: [{ type: st.type, props: st.create() }] }] }] },
      };
      expect(validateNotebook(json).errors, st.type).toEqual([]);
      expect(schemaErrors(json), st.type).toEqual([]);
    }
  });
});

describe('everything the app produces passes both the validator and the schema', () => {
  it('finds the v2 example notebooks', () => {
    expect(examples.length).toBeGreaterThanOrEqual(3);
    expect(examples).toContain('practice-lesson.json');
  });

  // Examples are documentation: strict, so they also import without warnings (no cross-card reads).
  it.each(examples)('docs/examples/%s', (file) => {
    const json = JSON.parse(readFileSync(`${EXAMPLES_DIR}/${file}`, 'utf8') as string);
    expect(json.version).toBe(2);
    expectValidBoth(json, file, true);
  });

  it('the example in docs/FORMAT.md', () => {
    const md = readFileSync('../docs/FORMAT.md', 'utf8') as string;
    const blocks = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    for (const b of blocks) expectValidBoth(JSON.parse(b), 'FORMAT.md example', true);
  });

  it('the demo notebook, exported', () => {
    expectValidBoth(exportNotebook(demoNotebook()), 'demoNotebook');
  });

  it('a notebook with one card of every built-in card type, exported', () => {
    const json = exportNotebook(builtinTypesNotebook());
    expect(json.notebook.sections[0].cards).toHaveLength(builtinCardTypes.length);
    expectValidBoth(json, 'builtinCardTypes');
  });
});

/** A small valid document; each fixture mutates a fresh copy. */
function base(): Record<string, any> {
  return {
    version: 2,
    notebook: {
      name: 'Base',
      cats: ['core'],
      sections: [
        {
          name: 'S',
          cards: [
            {
              tags: ['core'],
              slots: [
                { type: 'slider', props: { key: 'a', value: 1, min: 0, max: 10 } },
                { type: 'compute', props: { expr: 'a * 2', out: 'b', note: 'b =' } },
                { type: 'text', props: { text: 'b is {{b}}' } },
              ],
            },
            {
              slots: [{ type: 'choice', props: { q: 'Pick', options: ['x', 'y'], answer: [0], explanation: 'x' } }],
            },
          ],
        },
      ],
    },
  };
}

type Fixture = { name: string; make: () => unknown; structural: boolean };
const card0 = (d: Record<string, any>) => d.notebook.sections[0].cards[0];
const slot = (d: Record<string, any>, i: number) => card0(d).slots[i];
const mut = (f: (d: Record<string, any>) => void) => () => {
  const d = base();
  f(d);
  return d;
};

const FIXTURES: Fixture[] = [
  { name: 'not an object', make: () => ['version', 2], structural: true },
  { name: 'missing version', make: mut((d) => delete d.version), structural: true },
  { name: 'newer version', make: mut((d) => (d.version = 3)), structural: true },
  { name: 'missing notebook', make: mut((d) => delete d.notebook), structural: true },
  { name: 'sections not an array', make: mut((d) => (d.notebook.sections = {})), structural: true },
  { name: 'notebook width not a preset', make: mut((d) => (d.notebook.width = 'huge')), structural: true },
  { name: 'cats with a number', make: mut((d) => (d.notebook.cats = ['a', 1])), structural: true },
  { name: 'section kind not divider', make: mut((d) => (d.notebook.sections[0].kind = 'banner')), structural: true },
  { name: 'section width negative', make: mut((d) => (d.notebook.sections[0].width = -5)), structural: true },
  { name: 'card w below 3', make: mut((d) => (card0(d).w = 2)), structural: true },
  { name: 'card w above 12', make: mut((d) => (card0(d).w = 13)), structural: true },
  { name: 'card w as a string', make: mut((d) => (card0(d).w = '6')), structural: true },
  { name: 'card tags not an array', make: mut((d) => (card0(d).tags = 'core')), structural: true },
  { name: 'card verbs flip not boolean', make: mut((d) => (card0(d).verbs = { flip: 'yes' })), structural: true },
  { name: 'slots not an array', make: mut((d) => (card0(d).slots = 'oops')), structural: true },
  { name: 'unknown slot type', make: mut((d) => (slot(d, 2).type = 'quiz')), structural: true },
  { name: 'slot missing type', make: mut((d) => delete slot(d, 2).type), structural: true },
  { name: 'props not an object', make: mut((d) => (slot(d, 2).props = 'hello')), structural: true },
  { name: 'text props wrong type', make: mut((d) => (slot(d, 2).props = { text: 42 })), structural: true },
  { name: 'slider without key', make: mut((d) => delete slot(d, 0).props.key), structural: true },
  { name: 'slider value as a string', make: mut((d) => (slot(d, 0).props.value = '1')), structural: true },
  { name: 'choice with one option', make: mut((d) => (d.notebook.sections[0].cards[1].slots[0].props.options = ['x'])), structural: true },
  { name: 'list style unknown', make: mut((d) => card0(d).slots.push({ type: 'list', props: { items: ['a'], style: 'dots' } })), structural: true },
  { name: 'progress scope unknown', make: mut((d) => card0(d).slots.push({ type: 'progress', props: { scope: 'page' } })), structural: true },
  { name: 'image with a javascript: URL', make: mut((d) => card0(d).slots.push({ type: 'image', props: { src: 'javascript:alert(1)' } })), structural: true },
  { name: 'fuseW zero', make: mut((d) => (slot(d, 0).fuseW = 0)), structural: true },
  { name: 'reveal with a bad operator', make: mut((d) => (slot(d, 2).verbs = { reveal: { key: 'a', op: '=>', val: 1 } })), structural: true },
  // Semantic defects — beyond what a JSON Schema can express; the app's validator still rejects them.
  {
    name: 'choice answer index out of range',
    make: mut((d) => (d.notebook.sections[0].cards[1].slots[0].props.answer = [5])),
    structural: false,
  },
  {
    name: 'compute cycle',
    make: mut((d) => {
      card0(d).slots = [
        { type: 'compute', props: { expr: 'b + 1', out: 'a' } },
        { type: 'compute', props: { expr: 'a + 1', out: 'b' } },
      ];
    }),
    structural: false,
  },
  {
    name: 'table with ragged rows',
    make: mut((d) => card0(d).slots.push({ type: 'table', props: { rows: [['a', 'b'], ['c']] } })),
    structural: false,
  },
];

describe('bad documents are rejected', () => {
  it('has a broad fixture table', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(12);
    expect(base()).toBeTruthy();
    expectValidBoth(base(), 'base fixture', true);
  });

  it.each(FIXTURES)('$name', ({ make, structural }) => {
    const json = make();
    expect(validateNotebook(json).errors.length, 'validateNotebook must reject').toBeGreaterThan(0);
    if (structural) expect(schemaErrors(json).length, 'schema must reject').toBeGreaterThan(0);
    else expect(schemaErrors(json), 'schema cannot express this check; the validator owns it').toEqual([]);
  });
});
