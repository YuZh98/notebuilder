/**
 * The slot catalog an AI author (and the import hints) work from: one entry per slot type with
 * a one-line purpose and a small valid props example. Prop names, types and descriptions are
 * NOT repeated here — they are read from the published schema (lib/schema/schema.ts), so the
 * catalog cannot drift from the format. Adding a slot type = one entry below (plus its schema
 * def); ai-prompt.test.ts fails, naming the type, until both exist.
 */
import { propertyLines, renderType, slotPropsSchema } from './schema/schema';

export type CatalogEntry = {
  /** What the slot is for and when to reach for it, in one line. */
  purpose: string;
  /** A minimal, valid `props` object for this type. */
  example: Record<string, unknown>;
};

export const SLOT_CATALOG: Record<string, CatalogEntry> = {
  text: {
    purpose: 'Markdown prose with LaTeX math and live {{variable}} values: explanations, headings, worked examples.',
    example: { text: '## Slope\nThe slope of a line is $m = \\frac{\\Delta y}{\\Delta x}$.' },
  },
  list: {
    purpose: 'A bulleted or numbered list, or a "check" list readers tick off (a study tracker).',
    example: { items: ['Read the definition', 'Try the slider', 'Answer the quiz'], style: 'check' },
  },
  code: {
    purpose: 'A monospaced code block (not executed).',
    example: { code: 'def area(r):\n    return 3.14159 * r ** 2', lang: 'python' },
  },
  table: {
    purpose: 'A small grid of text: notation tables, comparisons. First row is the header.',
    example: { rows: [['Symbol', 'Meaning'], ['$\\mu$', 'mean'], ['$\\sigma$', 'standard deviation']] },
  },
  image: {
    purpose:
      'An image. Never invent URLs: leave src "" (an empty placeholder the author fills in) and describe the picture in alt.',
    example: { src: '', alt: 'Diagram: the unit circle with the angle θ marked' },
  },
  choice: {
    purpose: 'A self-checking multiple-choice question with an answer key and an explanation: the main retrieval-practice tool.',
    example: {
      q: 'What is the derivative of $x^2$?',
      options: ['$x$', '$2x$', '$x^2/2$', '$2$'],
      answer: [1],
      explanation: 'Power rule: $\\frac{d}{dx}x^n = n x^{n-1}$, so $2x$.',
    },
  },
  slider: {
    purpose: 'A number knob that writes a variable for its card: the input of an interactive model.',
    example: { key: 'r', value: 5, min: 0, max: 20, step: 0.5 },
  },
  'text-input': {
    purpose: 'A free-text answer box for predictions, explanations and reflection (not graded; done once answered).',
    example: { placeholder: 'Predict: what happens to the curve when r doubles?' },
  },
  compute: {
    purpose: "A formula over its card's variables that writes a new variable and shows `note` + the result.",
    example: { expr: 'round(100 * (1 + r/100) ^ 10)', out: 'A', note: '100 after 10 years =' },
  },
  chart: {
    purpose: "A live plot of y = f(x); every non-x name in fn is a card variable, so the curve follows the card's sliders.",
    example: { fn: 'a * x^2', x0: -5, x1: 5, label: 'y = a x²' },
  },
  progress: {
    purpose: 'A completion meter for the section, chapter or notebook; put one at the end of a section.',
    example: { scope: 'section', label: 'Your progress' },
  },
};

/** Catalog text for one slot type: heading, purpose, props (from the schema) and an example. */
export function catalogBlock(type: string): string {
  const entry = SLOT_CATALOG[type];
  const props = slotPropsSchema(type);
  const lines = [`### ${type}`, entry ? entry.purpose : '(no catalog entry)'];
  if (props) {
    lines.push(`props: ${renderType(props)}`);
    for (const l of propertyLines(props)) lines.push(`  - ${l}`);
  }
  if (entry) lines.push(`example slot: ${JSON.stringify({ type, props: entry.example })}`);
  return lines.join('\n');
}

/** `{ q?: string, options: string[], … }` — the props shape of a slot type, or '' if unknown. */
export function propsSignature(type: string): string {
  const props = slotPropsSchema(type);
  return props ? renderType(props) : '';
}
