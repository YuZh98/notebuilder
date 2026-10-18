/**
 * "From AI" prompt kit (D2c): a complete, self-contained prompt that lets any LLM write a
 * valid NoteBuilder notebook. The document shape and slot props are read from the published
 * schema (via slot-catalog / schema.ts), so the prompt cannot drift from the format; the
 * expression grammar mirrors lib/expr.ts and is pinned by ai-prompt.test.ts.
 *
 * Not imported by json-io.ts — keeps the schema and this kit out of the Reader bundle.
 */
import type { NotebookJSON } from './json-io';
import { allSlots } from './slots/registry';
import { SLOT_CATALOG, catalogBlock } from './slot-catalog';
import { NOTEBOOK_SCHEMA, propertyLines, schemaDef, slotPropsSchema } from './schema/schema';

export type AiPromptOptions = {
  /** What the notebook should teach. */
  topic: string;
  /** Who it is for, e.g. "first-year economics students". */
  audience?: string;
  /** Rough number of cards to aim for (1–60; anything else is ignored, larger is capped). */
  cards?: number;
  /** Append the full JSON Schema for models that use it (longer prompt). */
  includeSchema?: boolean;
};

/** Functions evalExpr understands, with a sample the tests evaluate against expr.ts. */
export const EXPR_FUNCTIONS: ReadonlyArray<{ name: string; doc: string; sample: string; expect: number }> = [
  { name: 'sin', doc: 'sin(a)', sample: 'sin(1)', expect: Math.sin(1) },
  { name: 'cos', doc: 'cos(a)', sample: 'cos(1)', expect: Math.cos(1) },
  { name: 'tan', doc: 'tan(a)', sample: 'tan(1)', expect: Math.tan(1) },
  { name: 'exp', doc: 'exp(a)', sample: 'exp(2)', expect: Math.exp(2) },
  { name: 'log', doc: 'log(a) (natural log)', sample: 'log(10)', expect: Math.log(10) },
  { name: 'sqrt', doc: 'sqrt(a)', sample: 'sqrt(2)', expect: Math.SQRT2 },
  { name: 'abs', doc: 'abs(a)', sample: 'abs(-3)', expect: 3 },
  { name: 'sign', doc: 'sign(a)', sample: 'sign(-2)', expect: -1 },
  { name: 'round', doc: 'round(a) (to a whole number)', sample: 'round(2.6)', expect: 3 },
  { name: 'floor', doc: 'floor(a)', sample: 'floor(2.7)', expect: 2 },
  { name: 'ceil', doc: 'ceil(a)', sample: 'ceil(2.1)', expect: 3 },
  { name: 'min', doc: 'min(a, b, ...)', sample: 'min(3, 1, 2)', expect: 1 },
  { name: 'max', doc: 'max(a, b, ...)', sample: 'max(3, 1, 2)', expect: 3 },
  { name: 'pow', doc: 'pow(a, b)', sample: 'pow(2, 10)', expect: 1024 },
  { name: 'clamp', doc: 'clamp(v, lo, hi)', sample: 'clamp(15, 0, 10)', expect: 10 },
];
export const EXPR_CONSTANTS: readonly string[] = ['pi', 'e', 'true', 'false'];

export const EXAMPLE_START = '--- BEGIN EXAMPLE ---\n';
export const EXAMPLE_END = '\n--- END EXAMPLE ---';

/**
 * The compact example embedded in every prompt. It must stay valid (ai-prompt.test.ts runs it
 * through validateNotebook and the schema) and shows each pattern the guidance asks for.
 */
export const AI_EXAMPLE: NotebookJSON = {
  version: 2,
  notebook: {
    name: 'Compound Growth',
    subtitle: 'Why money (and bacteria) grow faster and faster',
    cats: ['idea', 'explore', 'check'],
    sections: [
      {
        name: 'Growth on growth',
        title: 'Growth on growth',
        subtitle: 'See it, play with it, then test yourself.',
        cards: [
          {
            tags: ['idea'],
            slots: [
              {
                type: 'text',
                props: {
                  text: '## Compound growth\nEach year the amount grows by the rate $r$ **of the current amount**:\n$$A(t) = P\\left(1 + \\frac{r}{100}\\right)^t$$',
                },
              },
            ],
          },
          {
            tags: ['explore'],
            slots: [
              { type: 'slider', props: { key: 'r', value: 7, min: 0, max: 15, step: 0.5 }, w: 6 },
              { type: 'slider', props: { key: 't', value: 10, min: 0, max: 40, step: 1 }, w: 6 },
              { type: 'compute', props: { expr: 'round(100 * (1 + r/100) ^ t)', out: 'A', note: '100 grows to' } },
              { type: 'chart', props: { fn: '100 * (1 + r/100) ^ x', x0: 0, x1: 40, label: 'value of 100 over the years' } },
              { type: 'text', props: { text: 'At **{{r}}%** for **{{t}}** years, 100 becomes **{{A}}**.' } },
              { type: 'text-input', props: { placeholder: 'Predict: if r doubles, does the doubling time halve?' } },
            ],
          },
          {
            tags: ['check'],
            w: 6,
            slots: [
              {
                type: 'choice',
                props: {
                  q: 'At 6% a year, about how long until money doubles?',
                  options: ['6 years', '12 years', '24 years'],
                  answer: [1],
                  explanation:
                    'Rule of 72: $72 / 6 = 12$ (exactly $\\ln 2 / \\ln 1.06 \\approx 11.9$). 6 years mixes up the rate with the time; 24 years is the doubling time at 3%.',
                },
              },
            ],
          },
          {
            tags: ['check'],
            w: 6,
            verbs: { flip: true },
            slots: [{ type: 'text', props: { text: '**Q.** In $A(t) = P(1 + r)^t$, what does $t$ count?' } }],
            back: [{ type: 'text', props: { text: '**A.** The number of compounding periods (here, years).' } }],
          },
          {
            slots: [{ type: 'progress', props: { scope: 'section', label: 'Your progress' } }],
          },
        ],
      },
    ],
  },
};

/** Slot types to advertise: registered AND documented (a catalog entry and a schema def). */
function catalogTypes(): string[] {
  return allSlots()
    .map((s) => s.type)
    .filter((t) => SLOT_CATALOG[t] && slotPropsSchema(t));
}

/**
 * Layout/housekeeping fields the app's own editor sets (pixel widths, lock, archive, fused
 * rows). Valid in a file, but left out of the prompt so the model has less to get wrong.
 */
const AUTHOR_ONLY = {
  section: ['locked', 'width', 'svcOrder', 'svcW'],
  card: ['archived'],
  slot: ['fuse', 'fuseW'],
} as const;

/**
 * JSON with short objects/arrays kept on one line — a compact example the model can still read.
 * Equivalent to JSON.stringify(value) once whitespace is ignored.
 */
export function compactJson(value: unknown, indent = '', width = 96): string {
  const flat = JSON.stringify(value);
  if (flat === undefined || value === null || typeof value !== 'object' || indent.length + flat.length <= width) {
    return flat ?? 'null';
  }
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => inner + compactJson(v, inner, width)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, inner, width)}`).join(',\n')}\n${indent}}`;
}

function shapeBlock(title: string, defName: string, skip: readonly string[] = []): string {
  const def = schemaDef(defName);
  if (!def) return '';
  const lines = propertyLines(def, skip).map((l) => `  - ${l}`);
  return [title, ...lines].join('\n');
}

function lengthLine(cards: number | undefined): string {
  if (typeof cards === 'number' && Number.isFinite(cards) && cards >= 1) {
    const n = Math.min(60, Math.round(cards));
    return `Length: about ${n} cards, grouped into sections (lessons) of 3–8 cards.`;
  }
  return 'Length: 8–20 cards, grouped into sections (lessons) of 3–8 cards.';
}

/** Build the complete prompt an author pastes into any LLM. Deterministic for a given input. */
export function buildAiPrompt(opts: AiPromptOptions): string {
  const topic = opts.topic.trim() || 'a topic of your choice';
  const audience = opts.audience?.trim();
  const types = catalogTypes();
  const fnDocs = EXPR_FUNCTIONS.map((f) => f.doc).join(', ');

  const parts: string[] = [
    'You are an expert teacher and instructional designer. Write an interactive study notebook for the NoteBuilder app.',
    '',
    `Topic: ${topic}`,
    ...(audience ? [`Audience: ${audience}`] : []),
    lengthLine(opts.cards),
    '',
    '## Output contract',
    '- Reply with ONLY one JSON object: no text before or after it, no code fences, no comments.',
    '- Strict JSON: double-quoted keys and strings, no trailing commas, line breaks inside strings written as \\n.',
    '- In JSON strings double every backslash: LaTeX is written "$\\\\frac{a}{b}$" and "$\\\\alpha$" (a single backslash corrupts the math).',
    '- The top level is {"version": 2, "notebook": {...}}; "version": 2 is the number 2.',
    '- Use only the fields and slot types described below. Never invent fields or slot types.',
    '',
    '## Document shape',
    'Top level: {"version": 2, "notebook": Notebook}',
    shapeBlock('Notebook', 'notebook'),
    shapeBlock('Section', 'section', AUTHOR_ONLY.section),
    shapeBlock('Card', 'card', AUTHOR_ONLY.card),
    shapeBlock('CardVerbs (card.verbs)', 'cardVerbs'),
    shapeBlock('Slot (one block inside a card)', 'slot', AUTHOR_ONLY.slot),
    shapeBlock('SlotVerbs (slot.verbs)', 'slotVerbs'),
    '',
    '## Slot catalog',
    `Slot types: ${types.join(', ')}. Each slot is {"type": ..., "props": {...}}; "props" is always an object ({} if empty).`,
    '',
    ...types.map((t) => catalogBlock(t) + '\n'),
    '## Variables, formulas and the card-scope rule',
    '- A card is a small model. A slider writes the variable named by its key; a compute writes the variable named by its out.',
    '- Slots of the SAME card read those variables: compute expr, chart fn, {{name}} in text, and verbs.reveal.key.',
    '- Variables never cross cards: a slot can only read variables written by a slider or compute in its own card (the front and back of a flip card share one scope). If two cards need the same quantity, give each card its own slider.',
    '- No cycles: a compute must not depend, directly or through other computes, on its own out.',
    `- Names: letters, digits and _, starting with a letter; case-sensitive. Do not use x (the chart axis) or a function/constant name (${[...EXPR_FUNCTIONS.map((f) => f.name), ...EXPR_CONSTANTS].join(', ')}).`,
    '- {{name}} prints a variable\'s current value. Only a plain name goes inside {{ }}, never math: compute the value first, then print it. Values print unrounded, so round in the compute: round(v * 100) / 100 keeps 2 decimals.',
    '- Expression grammar (compute expr and chart fn):',
    '  - numbers: 3, 0.25, 1000000 (no exponent notation such as 1e6)',
    '  - arithmetic: + - * /, ^ (power, right-associative; never **), % or mod (remainder), // (floor division), unary -',
    '  - a leading minus binds tighter than ^: -x^2 means (-x)^2, so write -(x^2) (a bell curve is exp(-(x^2)/2))',
    '  - comparison and logic: == != < <= > >= && || !, and condition ? a : b',
    `  - functions: ${fnDocs}; trigonometry uses radians`,
    `  - constants: ${EXPR_CONSTANTS.join(', ')}`,
    '  - parentheses group; anything unknown (a misspelled variable or function) silently evaluates to 0',
    '',
    '## Teaching guidance',
    '- One idea per card. Keep text short: a heading plus a few sentences or bullets. Use LaTeX for math.',
    '- Only text slots and a choice\'s q and explanation render markdown, $math$ and {{name}}. Everything else (options, list items, table cells, labels, notes) is plain text: write math there with Unicode (x², √2, π, ≤).',
    '- Retrieval practice: after each new idea add 1–3 choice questions with a correct answer key (0-based indexes into options) and an explanation that says why the answer is right and why the tempting wrong option is wrong. Make distractors real misconceptions.',
    '- Flashcards: for definitions, formulas and key facts use a card with "verbs": {"flip": true}, the prompt in slots and the answer in back.',
    '- Guided exploration: wherever a result depends on parameters, build ONE card with sliders, computes and a chart, text that quotes the live values with {{name}}, and a question (choice or text-input) asking what the learner notices or predicts.',
    '- Structure: sections are lessons that build on each other; in long notebooks start each part with a {"kind": "divider", "name": ..., "cards": []} section. End each lesson with a short quiz and a progress slot.',
    '- Tags: tag cards by role or concept (for example "idea", "explore", "check") and list every tag in notebook.cats.',
    '- Layout: small cards (a single question or flashcard) can take "w": 6 so two sit side by side; keep explanations and models full width.',
    '',
    '## Checklist before you answer',
    '- One JSON object with "version": 2 and nothing outside it.',
    `- Every slot has "type" (one of: ${types.join(', ')}) and a "props" object.`,
    '- Every choice has at least 2 options, and every answer index is less than the number of options.',
    '- Every variable a card reads is written by a slider or compute in that same card, and no formula depends on itself.',
    '- Every LaTeX backslash is doubled.',
    '',
    '## Example of a complete, valid notebook (the shape to follow; write your own content)',
    EXAMPLE_START + compactJson(AI_EXAMPLE) + EXAMPLE_END,
  ];

  if (opts.includeSchema) {
    parts.push('', '## Full JSON Schema (reference)', JSON.stringify(NOTEBOOK_SCHEMA, null, 2));
  }
  return parts.filter((p, i, all) => !(p === '' && all[i - 1] === '')).join('\n');
}
