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
