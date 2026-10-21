import { uid } from './uid';
import type { Card, Slot, SlotProps, VerbConfig } from './types';

/** A slot template inside a card type — no instance id until stamped. */
export type SlotTemplate = {
  type: string;
  props: SlotProps;
  verbs?: VerbConfig;
  w?: number;
  fuse?: boolean;
  fuseW?: number;
};

/** A named accent variant of a card type. */
export type Variety = { name: string; accent: string };

/** A shelf in the store that groups products by mode. */
export type Store = { id: string; name: string };

/** The three built-in stores; Workshop is store:null products, not a row here. */
export const STORES: readonly Store[] = [
  { id: 'write', name: 'Write' },
  { id: 'practice', name: 'Practice' },
  { id: 'live', name: 'Live' },
];

/** Glyphs offered as product icons, verbatim from v1. */
export const PROD_ICONS: readonly string[] = [
  '📊', '📈', '🎲', '🪙', '📐', '🧮', '🔑', '📌', '🃏', '❓', '✅', '📝',
  '🔗', '📚', '🔬', '🎯', '💡', '🧠', '⚡', '∑', '∫', '∂', '√', 'π',
  'σ', 'μ', 'λ', '∞', '◆', '●', '▲', '★', '♦', '✦',
];

/**
 * A card type: a recipe of slots saved in the Factory/gallery.
 * Stamping produces an independent CardInstance — no live link back.
 */
export type CardType = {
  id: string;
  name: string;
  description?: string;
  verbs?: Card['verbs'];
  slots: SlotTemplate[];
  back?: SlotTemplate[];
  accent?: string;
  note?: string;
  icon?: string;
  store?: string | null;
  varieties?: Variety[];
  w?: number;
};

/** Store → notebook: stamp a card and overlay the chosen accent (variety > type > none, v1 80-actions:12-14). */
export function placeType(
  ct: CardType,
  sectionId: string,
  position: number,
  variety?: Variety,
): Card {
  const card = stampCard(ct, sectionId, position);
  const accent = variety?.accent || ct.accent || undefined;
  if (accent) card.accent = accent;
  return card;
}

/** The chip glyph for a product: its icon, else the first letter of its name, else a box. */
export function prodIcon(ct: CardType): string {
  if (ct.icon) return ct.icon;
  const first = ct.name.trim().charAt(0);
  return first ? first.toUpperCase() : '📦';
}

/** Gallery → notebook: stamp an independent card instance from a type. */
export function stampCard(type: CardType, sectionId: string, position: number): Card {
  return {
    id: uid('card'),
    sectionId,
    typeId: type.id,
    position,
    slots: type.slots.map(stampSlot),
    ...(type.verbs && { verbs: structuredClone(type.verbs) }),
    ...(type.back && { back: type.back.map(stampSlot) }),
    ...(type.w != null && { w: type.w }),
  };
}

/** Factory: capture an authored card as a reusable card type. */
export function cardToType(card: Card, name: string): CardType {
  return {
    id: uid('ct'),
    name,
    slots: card.slots.map(templateSlot),
    ...(card.verbs && { verbs: structuredClone(card.verbs) }),
    ...(card.back && { back: card.back.map(templateSlot) }),
  };
}

/** Synthetic card for CardView previews — a throwaway stamp with fresh, deep-cloned slots. */
export function typePreviewCard(ct: CardType): Card {
  return stampCard(ct, '', 0);
}

export function stampSlot(t: SlotTemplate): Slot {
  return {
    id: uid('slot'),
    type: t.type,
    props: structuredClone(t.props),
    ...(t.verbs && { verbs: structuredClone(t.verbs) }),
    ...(t.w !== undefined && { w: t.w }),
    ...(t.fuse !== undefined && { fuse: t.fuse }),
    ...(t.fuseW !== undefined && { fuseW: t.fuseW }),
  };
}

export function templateSlot(s: Slot): SlotTemplate {
  return {
    type: s.type,
    props: structuredClone(s.props),
    ...(s.verbs && { verbs: structuredClone(s.verbs) }),
    ...(s.w !== undefined && { w: s.w }),
    ...(s.fuse !== undefined && { fuse: s.fuse }),
    ...(s.fuseW !== undefined && { fuseW: s.fuseW }),
  };
}

/**
 * Builtin ids that existed before the seeded-builtins ledger was introduced.
 * A DB that has card types but no ledger preference was seeded from exactly
 * this set, so treating it as the ledger keeps old deletions deleted while
 * still letting every later builtin seed itself on next launch.
 */
export const LEGACY_SEEDED_BUILTINS: readonly string[] = [
  'ct_flashcard', 'ct_quiz', 'ct_note', 'ct_tracker', 'ct_mastery',
  'ct_sliderlab', 'ct_gaussian', 'ct_payoff', 'ct_compound', 'ct_quizcard',
];

/** Builtins absent from the seeded ledger — what a boot still needs to seed. */
export function unseededBuiltins(seededIds: Iterable<string>): CardType[] {
  const seen = new Set(seededIds);
  return builtinCardTypes.filter((b) => !seen.has(b.id));
}

/**
 * Parse the seeded_builtins ledger preference. Garbage JSON or valid JSON of
 * the wrong shape (a number, an object, an array of non-strings) falls back
 * to the legacy set rather than throwing and aborting boot hydration.
 */
export function parseSeededLedger(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed;
  } catch {
    // garbage JSON: fall through to the legacy fallback below
  }
  return [...LEGACY_SEEDED_BUILTINS];
}

export const builtinCardTypes: CardType[] = [
  { id: 'ct_flashcard', name: 'Flashcard', store: 'practice', accent: '#6ea8fe', w: 6,
    verbs: { flip: true },
    slots: [{ type: 'text', props: { text: '**Q.** What is $E[X]$ for $X\\sim\\text{Bernoulli}(p)$?' } }],
    back:  [{ type: 'text', props: { text: '**A.** $p$' } }],
    varieties: [{ name: 'Blue', accent: '#6ea8fe' }, { name: 'Mint', accent: '#54d6a0' }] },
  { id: 'ct_quiz', name: 'Quiz', store: 'practice', w: 6,
    slots: [
      { type: 'choice', props: { q: 'Var of a fair coin flip (0/1)?', options: ['0.25', '0.5', '1'], answer: [0], multi: false, explanation: 'Var = p(1-p) = 0.25' } }] },
  { id: 'ct_note', name: 'Note', store: 'write', verbs: { bare: true },
    slots: [{ type: 'text', props: { text: '**Note.** Write anything — renders as bare script, no card frame. Math: P(A∩B)=P(A)P(B) when independent.' } }] },
  { id: 'ct_tracker', name: 'Tracker', store: 'practice', w: 6,
    slots: [{ type: 'list', props: { items: ['Bernoulli', 'Binomial', 'Poisson', 'Normal'], style: 'check' } }] },
  { id: 'ct_mastery', name: 'Mastery Dashboard', store: 'practice',
    slots: [
      { type: 'text', props: { text: '## 📊 Room mastery' } },
      { type: 'progress', props: { label: 'Cards finished', scope: 'section', show: { mn: true, pct: true, bar: true } } }] },
  { id: 'ct_sliderlab', name: 'Slider Lab', store: 'live', accent: '#b388ff', icon: '🎚',
    slots: [
      { type: 'text', props: { text: '## Drag μ — watch it react' } },
      { type: 'slider', props: { key: 'mu', min: 0, max: 100, value: 30 } },
      { type: 'text', props: { text: 'Current μ = **{{mu}}** — this number is live.' } }] },
  { id: 'ct_gaussian', name: 'Gaussian Lab', store: 'live', accent: '#6ea8fe', icon: '∿',
    slots: [
      { type: 'text', props: { text: '## Normal distribution  N(μ, σ²)' } },
      { type: 'slider', props: { key: 'mu', min: -3, max: 3, value: 0, step: 0.1 } },
      { type: 'slider', props: { key: 'sg', min: 0.3, max: 2.5, value: 1, step: 0.05 } },
      { type: 'chart', props: { fn: 'exp(0 - (x-mu)*(x-mu)/(2*sg*sg)) / (sg*sqrt(2*pi))', x0: -4, x1: 4, label: 'density f(x)' } },
      { type: 'compute', props: { expr: 'round( 1/(sg*sqrt(2*pi)) *1000)/1000', out: 'peak', note: 'peak density =' } },
      { type: 'compute', props: { expr: 'round(sg*sg*1000)/1000', out: 'variance', note: 'variance σ² =' } }] },
  { id: 'ct_payoff', name: 'Option Payoff', store: 'live', accent: '#f0a868', icon: '📈',
    slots: [
      { type: 'text', props: { text: '## Long call — payoff at expiry' } },
      { type: 'slider', props: { key: 'K', min: 0, max: 100, value: 50, step: 1 } },
      { type: 'chart', props: { fn: 'max(0, x - K)', x0: 0, x1: 100, label: 'payoff vs stock price S' } },
      { type: 'compute', props: { expr: 'K', out: 'breakeven', note: 'breakeven (ignoring premium) =' } }] },
  { id: 'ct_compound', name: 'Compound Growth', store: 'live', accent: '#54d6a0', icon: '💰',
    slots: [
      { type: 'text', props: { text: '## $1000 at compound interest' } },
      { type: 'slider', props: { key: 'rate', min: 0, max: 20, value: 5, step: 0.5, showSlider: false, showName: true, showValue: true } },
      { type: 'slider', props: { key: 'years', min: 0, max: 40, value: 10, step: 1, showSlider: false, showName: true, showValue: true } },
      { type: 'compute', props: { expr: 'round(1000*pow(1+rate/100, years))', out: 'fv', note: 'future value of $1000 =' } },
      { type: 'chart', props: { fn: '1000*pow(1 + rate/100, x)', x0: 0, x1: 40, label: '$1000 over the years' } }] },
  { id: 'ct_quizcard', name: 'Quiz Card', store: 'practice', w: 6, verbs: { flip: true },
    slots: [{ type: 'text', props: { text: '**Q.** Var of a fair coin flip (0/1)?' } }],
    back: [
      { type: 'choice', props: { q: 'Pick the variance:', options: ['0.25', '0.5', '1'], answer: [0], multi: false, explanation: 'Var = p(1−p) = **0.25**' } }] },
  // Predict → explore → explain: an ungraded prediction gates the simulation (every later slot is
  // step-by-step, and the prediction is the card's only completable slot), so students commit to
  // an idea before they see the answer, then reconcile the two.
  { id: 'ct_guided', name: 'Guided Explore', store: 'live', accent: '#34e1ff', icon: '🔬',
    description: 'Predict, then explore, then explain: the simulation unlocks once the student commits to a prediction.',
    note: 'Keep the prediction ungraded (no answer key) and every later slot Step-by-step, so nothing shows until students commit. Swap in your own sliders, formulas and chart.',
    slots: [
      { type: 'text', props: { text: '## Predict, then explore\n\nA deposit of 1000 earns interest at **r%** a year for **t** years, and the interest compounds. Make a prediction first: the simulation unlocks once you submit it.' } },
      { type: 'choice', props: {
        q: '**Your prediction.** If the interest rate *doubles* (say from 4% to 8%), the interest earned over 20 years…',
        options: ['…exactly doubles', '…more than doubles', '…less than doubles'],
        multi: false,
        explanation: 'Prediction locked in. Now test it: drag the sliders below.' } },
      { type: 'slider', props: { key: 'r', min: 1, max: 12, value: 4, step: 0.5 }, verbs: { sequential: true }, w: 6 },
      { type: 'slider', props: { key: 't', min: 1, max: 40, value: 20, step: 1 }, verbs: { sequential: true }, w: 6 },
      { type: 'compute', props: { expr: 'round(1000 * ((1 + r/100)^t - 1))', out: 'gain', note: 'interest earned at r% =' }, verbs: { sequential: true }, w: 6 },
      { type: 'compute', props: { expr: 'round(1000 * ((1 + 2*r/100)^t - 1))', out: 'gain2', note: 'interest earned at 2r% =' }, verbs: { sequential: true }, w: 6 },
      { type: 'compute', props: { expr: 'round(gain2 / gain * 100) / 100', out: 'times', note: 'doubling the rate multiplies the interest by' }, verbs: { sequential: true } },
      { type: 'chart', props: { fn: '((1 + 2*r/100)^x - 1) / ((1 + r/100)^x - 1)', x0: 1, x1: 41, xticks: 4, hover: true, label: 'interest at 2r% ÷ interest at r%, after x years' }, verbs: { sequential: true } },
      { type: 'text', props: { text: '**Explain.** At **{{r}}%** for **{{t}}** years the interest is **{{gain}}**; at double the rate it is **{{gain2}}**, which is **{{times}}×** as much. Compare that with your prediction.\n\nFor more than one year, doubling the rate *more than* doubles the interest, because each year\'s interest also earns interest. Set t = 1: with nothing to compound yet, it is exactly 2×. Why does the gap widen as t grows?' }, verbs: { sequential: true } }] },
  // Worked example with self-explanation prompts; each step unlocks once the student has explained
  // the one before, and the example fades into a problem with the first step already done.
  { id: 'ct_worked', name: 'Worked Example', store: 'practice', accent: '#54d6a0', icon: '📝',
    description: 'A worked solution revealed step by step, with self-explanation prompts, fading into a problem to try.',
    note: 'One step per text slot, each followed by a "why" box; later steps are Step-by-step, so each unlocks once the one before is explained. End with a similar problem that has the first step done.',
    slots: [
      { type: 'text', props: { text: '## Worked example\n\n**Problem.** Solve $\\dfrac{x}{4} + 3 = 8$.' } },
      { type: 'text', props: { text: '**Step 1.** Subtract 3 from both sides:\n\n$$\\frac{x}{4} = 5$$' } },
      { type: 'text-input', props: { placeholder: 'Why is this step valid? Explain it in your own words to unlock step 2.' } },
      { type: 'text', props: { text: '**Step 2.** Multiply both sides by 4:\n\n$$x = 20$$\n\n**Check.** $\\frac{20}{4} + 3 = 5 + 3 = 8$ ✓' }, verbs: { sequential: true } },
      { type: 'text-input', props: { placeholder: 'Why multiply by 4, and why on both sides?' }, verbs: { sequential: true } },
      { type: 'problem', props: {
        prompt: '**Now you try.** The first step is done for you.\n\nSolve $\\dfrac{x}{ {{a}} } + {{b}} = {{c}}$.\n\nStep 1: $\\dfrac{x}{ {{a}} } = {{c}} - {{b}}$. Finish it: what is $x$?',
        params: [
          { name: 'a', min: 2, max: 9, step: 1 },
          { name: 'b', min: 1, max: 9, step: 1 },
          { name: 'c', min: 10, max: 20, step: 1 }],
        answer: 'a * (c - b)', tol: 0, need: 1,
        explain: 'Work out ${{c}} - {{b}}$, then multiply both sides by {{a}}: $x = {{a}} \\times ({{c}} - {{b}})$. Check it by substituting back.' },
        verbs: { sequential: true } }] },
  // Randomized retrieval practice: two different problem kinds, mixed, each drawing fresh numbers
  // until the student has answered enough of them correctly.
  { id: 'ct_practiceset', name: 'Practice Set', store: 'practice', accent: '#f0a500', icon: '🎯',
    description: 'Two kinds of randomized problem, mixed: each draws fresh numbers until the student has enough right.',
    note: 'Mix different kinds of problem. Give each a range for every number, an answer formula and a worked explanation; "need" sets how many correct answers finish it.',
    slots: [
      { type: 'text', props: { text: '## Practice set\n\nTwo kinds of problem, mixed. Press **New numbers** for a fresh one; each problem is finished after enough correct answers.' } },
      { type: 'problem', props: {
        prompt: '**1.** What is {{p}}% of {{n}}?',
        params: [
          { name: 'p', min: 5, max: 95, step: 5 },
          { name: 'n', min: 20, max: 400, step: 20 }],
        answer: 'p * n / 100', tol: 0, need: 3,
        explain: '{{p}}% means {{p}} hundredths, so take $\\frac{ {{p}} }{100} \\times {{n}}$.' } },
      { type: 'problem', props: {
        prompt: '**2.** Solve $\\dfrac{x}{ {{a}} } - {{b}} = {{c}}$. What is $x$?',
        params: [
          { name: 'a', min: 2, max: 6, step: 1 },
          { name: 'b', min: 2, max: 9, step: 1 },
          { name: 'c', min: 1, max: 9, step: 1 }],
        answer: 'a * (c + b)', tol: 0, need: 2,
        explain: 'Add {{b}} to both sides: $\\dfrac{x}{ {{a}} } = {{c}} + {{b}}$. Then multiply both sides by {{a}}: $x = {{a}} \\times ({{c}} + {{b}})$.' } }] },
  { id: 'ct_cheatsheet', name: 'Cheatsheet', store: 'write', accent: '#27ff9e', icon: '📋', w: 6,
    varieties: [{ name: 'Neon', accent: '#27ff9e' }, { name: 'Blue', accent: '#6ea8fe' }, { name: 'Amber', accent: '#f0a868' }],
    slots: [
      { type: 'text', props: { text: '### Derivative Rules\n\nThe derivative is the instantaneous rate of change, the slope of the tangent.' } },
      { type: 'table', props: { rows: [
        ['RULE', 'FORMULA'],
        ['Power', '`d/dx x^n = n*x^(n-1)`'],
        ['Product', "`(fg)' = f'g + fg'`"],
        ['Chain', "`(f(g(x)))' = f'(g(x)) * g'(x)`"]] } },
      { type: 'text', props: { text: '> **Example.** `d/dx (3x+1)^5 = 15(3x+1)^4` (chain).' } }] },
  { id: 'ct_ironfly', name: 'Iron Butterfly', store: 'live', accent: '#27ff9e', icon: '🦋',
    varieties: [{ name: 'Neon', accent: '#27ff9e' }, { name: 'Amber', accent: '#f0a868' }],
    slots: [
      { type: 'text', props: { text: '### Payoff explorer: iron butterfly\n\nShort a straddle at $K_0$, buy wings $W$ away, collect net credit $C$.' } },
      { type: 'slider', props: { key: 'K0', value: 100, min: 80, max: 120, step: 5 }, w: 4 },
      { type: 'slider', props: { key: 'W', value: 10, min: 5, max: 25, step: 5 }, w: 4 },
      { type: 'slider', props: { key: 'C', value: 3.5, min: 1, max: 8, step: 0.25 }, w: 4 },
      { type: 'compute', props: { expr: 'C', out: 'maxProfit', note: 'max profit' }, w: 3 },
      { type: 'compute', props: { expr: 'C - W', out: 'maxLoss', note: 'max loss' }, w: 3 },
      { type: 'compute', props: { expr: 'K0 - C', out: 'beLow', note: 'breakeven low' }, w: 3 },
      { type: 'compute', props: { expr: 'K0 + C', out: 'beHigh', note: 'breakeven high' }, w: 3 },
      { type: 'chart', props: { fn: 'C - max(K0 - x, 0) - max(x - K0, 0) + max(K0 - W - x, 0) + max(x - K0 - W, 0)', label: 'P&L at expiry vs spot', x0: 60, x1: 140, y0: -25, y1: 10, xticks: 8, yticks: 7, hover: true } },
      { type: 'text', props: { text: 'Peaks at **{{maxProfit}}**, floors at **{{maxLoss}}**, crosses zero at **{{beLow}}** and **{{beHigh}}**.' } }] },
  { id: 'ct_codecard', name: 'Code Card', store: 'write', accent: '#b388ff', icon: '⌨', w: 6,
    varieties: [{ name: 'Violet', accent: '#b388ff' }, { name: 'Neon', accent: '#27ff9e' }],
    slots: [
      { type: 'text', props: { text: '### Snippet\n\nSyntax-highlighted source for your own REPL.' } },
      { type: 'code', props: { lang: 'python', code: 'import numpy as np\n\ndef mc_call(s0=100, k=100, vol=0.2, t=0.25, n=100_000, seed=7):\n    z = np.random.default_rng(seed).standard_normal(n)\n    st = s0 * np.exp(-0.5 * vol**2 * t + vol * np.sqrt(t) * z)\n    return np.maximum(st - k, 0).mean()' } }] },
];
