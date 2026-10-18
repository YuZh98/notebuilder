import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import schema from './schema/notebook.schema.json';
import {
  buildAiPrompt,
  compactJson,
  AI_EXAMPLE,
  EXAMPLE_START,
  EXAMPLE_END,
  EXPR_FUNCTIONS,
  EXPR_CONSTANTS,
} from './ai-prompt';
import { SLOT_CATALOG } from './slot-catalog';
import { allSlots, getSlot } from './slots/registry';
import { validateNotebook } from './json-io';
import { evalExpr } from './expr';

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const schemaValid = ajv.compile(schema);

function embeddedExample(prompt: string): unknown {
  const start = prompt.indexOf(EXAMPLE_START);
  const end = prompt.indexOf(EXAMPLE_END);
  expect(start, 'example start marker').toBeGreaterThanOrEqual(0);
  expect(end, 'example end marker').toBeGreaterThan(start);
  return JSON.parse(prompt.slice(start + EXAMPLE_START.length, end));
}

describe('buildAiPrompt', () => {
  const prompt = buildAiPrompt({ topic: 'Photosynthesis', audience: 'high-school biology students', cards: 14 });

  it('names the topic, audience and length', () => {
    expect(prompt).toContain('Photosynthesis');
    expect(prompt).toContain('high-school biology students');
    expect(prompt).toMatch(/about 14 cards/);
  });

  it('states the output contract: one JSON object, version 2, nothing else', () => {
    expect(prompt).toMatch(/ONLY one JSON object/);
    expect(prompt).toContain('"version": 2');
    expect(prompt).toMatch(/no code fences/i);
    expect(prompt).toMatch(/double every backslash/i);
  });

  it('teaches the card-scope variable rule and the expression grammar', () => {
    expect(prompt).toMatch(/variables never cross cards/i);
    expect(prompt).toContain('{{name}}');
    for (const fn of EXPR_FUNCTIONS) expect(prompt).toContain(fn.name);
    for (const c of EXPR_CONSTANTS) expect(prompt).toContain(c);
  });

  it('carries pedagogy guidance: retrieval practice, flashcards, guided exploration', () => {
    expect(prompt).toMatch(/retrieval practice/i);
    expect(prompt).toMatch(/flashcard/i);
    expect(prompt).toMatch(/explanation/);
    expect(prompt).toMatch(/explor/i);
  });

  it('lists every registered slot type in the catalog', () => {
    for (const { type } of allSlots()) {
      expect(
        SLOT_CATALOG[type],
        `slot type "${type}" is registered but has no SLOT_CATALOG entry in lib/slot-catalog.ts — add one (and its schema def)`,
      ).toBeDefined();
      expect(prompt, `prompt catalog is missing "${type}"`).toContain(`### ${type}\n`);
    }
  });

  it('embeds an example that passes validateNotebook (no errors, no warnings) and the schema', () => {
    const example = embeddedExample(prompt);
    expect(example).toEqual(AI_EXAMPLE);
    expect(validateNotebook(example)).toEqual({ errors: [], warnings: [] });
    expect(schemaValid(example), JSON.stringify(schemaValid.errors)).toBe(true);
  });

  it('the example demonstrates the patterns the guidance asks for', () => {
    const cards = AI_EXAMPLE.notebook.sections.flatMap((s) => s.cards);
    const slotTypes = (c: (typeof cards)[number]) => [...c.slots, ...(c.back ?? [])].map((s) => s.type);
    expect(cards.some((c) => c.verbs?.flip && c.back?.length)).toBe(true);
    expect(cards.some((c) => c.slots.some((s) => s.type === 'choice' && s.props.explanation))).toBe(true);
    expect(cards.some((c) => ['slider', 'compute', 'chart'].every((t) => slotTypes(c).includes(t)))).toBe(true);
    expect(JSON.stringify(AI_EXAMPLE)).toContain('\\\\'); // shows a doubled LaTeX backslash
  });

  it('is deterministic and needs only a topic', () => {
    expect(buildAiPrompt({ topic: 'Fractions' })).toBe(buildAiPrompt({ topic: 'Fractions' }));
    const minimal = buildAiPrompt({ topic: '  Fractions  ' });
    expect(minimal).toContain('Fractions');
    expect(minimal).not.toMatch(/Audience:/);
  });

  it('ignores a nonsensical card count', () => {
    expect(buildAiPrompt({ topic: 'T', cards: 0 })).not.toMatch(/about 0 cards/);
    expect(buildAiPrompt({ topic: 'T', cards: Number.NaN })).not.toMatch(/NaN/);
    expect(buildAiPrompt({ topic: 'T', cards: 500 })).toMatch(/about 60 cards/);
  });

  it('derives the document shape and slot props from the published schema', () => {
    expect(prompt).toContain('sections: Section[]');
    expect(prompt).toContain('w?: number (3–12)');
    expect(prompt).toContain('options: string[] (at least 2 items)');
    expect(prompt).toContain('props: { scope: "section" | "chapter" | "notebook"');
    // editor-only housekeeping fields stay out of the prompt
    expect(prompt).not.toMatch(/^\s+- (svcW|fuseW|archived)\??:/m);
  });

  it('can append the full JSON Schema', () => {
    const withSchema = buildAiPrompt({ topic: 'T', includeSchema: true });
    expect(withSchema).toContain('"$schema": "https://json-schema.org/draft/2020-12/schema"');
    expect(buildAiPrompt({ topic: 'T' })).not.toContain('draft/2020-12');
  });
});

describe('compactJson', () => {
  it('round-trips to the same value and keeps short values on one line', () => {
    const values: unknown[] = [
      AI_EXAMPLE,
      { a: [], b: {}, c: 'line\nbreak "quoted" \\ backslash', d: [1, [2, [3, { e: null }]]], f: true },
      [],
      'x',
      0,
      null,
    ];
    for (const v of values) expect(JSON.parse(compactJson(v))).toEqual(v);
    expect(compactJson({ a: [1, 2] })).toBe('{"a":[1,2]}');
    expect(compactJson({ long: 'y'.repeat(120) })).toContain('\n');
  });
});

describe('slot catalog examples', () => {
  it('every catalog entry is a registered slot whose example props pass validate() and the schema', () => {
    for (const [type, entry] of Object.entries(SLOT_CATALOG)) {
      const st = getSlot(type);
      expect(st, `catalog lists "${type}" but no such slot is registered`).toBeDefined();
      expect(st!.validate?.(entry.example) ?? [], type).toEqual([]);
      const doc = { version: 2, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots: [{ type, props: entry.example }] }] }] } };
      expect(schemaValid(doc), `${type}: ${JSON.stringify(schemaValid.errors)}`).toBe(true);
    }
  });
});

describe('expression grammar documented in the prompt matches expr.ts', () => {
  it('every documented function evaluates as described', () => {
    for (const { name, sample, expect: want } of EXPR_FUNCTIONS) {
      expect(evalExpr(sample, {}), `${name}: ${sample}`).toBeCloseTo(want, 9);
    }
  });

  it('constants and operators behave as documented', () => {
    expect(evalExpr('pi', {})).toBeCloseTo(Math.PI);
    expect(evalExpr('e', {})).toBeCloseTo(Math.E);
    expect(evalExpr('true', {})).toBe(true);
    expect(evalExpr('2 ^ 3 ^ 2', {})).toBe(512); // right-associative
    expect(evalExpr('7 // 2', {})).toBe(3);
    expect(evalExpr('7 mod 4', {})).toBe(3);
    expect(evalExpr('1 < 2 ? 10 : 20', {})).toBe(10);
    expect(evalExpr('unknownName + 1', {})).toBe(1); // unknown names are 0
    expect(evalExpr('nosuchfn(3)', {})).toBe(0);
  });
});
