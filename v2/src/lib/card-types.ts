import { uid } from './uid';
import type { Card, Slot, SlotProps, VerbConfig } from './types';

/** A slot template inside a card type — no instance id until stamped. */
export type SlotTemplate = {
  type: string;
  props: SlotProps;
  verbs?: VerbConfig;
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
};

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

function stampSlot(t: SlotTemplate): Slot {
  return {
    id: uid('slot'),
    type: t.type,
    props: structuredClone(t.props),
    ...(t.verbs && { verbs: structuredClone(t.verbs) }),
  };
}

function templateSlot(s: Slot): SlotTemplate {
  return {
    type: s.type,
    props: structuredClone(s.props),
    ...(s.verbs && { verbs: structuredClone(s.verbs) }),
  };
}

export const builtinCardTypes: CardType[] = [
  { id: 'ct_flashcard', name: 'Flashcard', store: 'practice', accent: '#6ea8fe',
    verbs: { flip: true },
    slots: [{ type: 'text', props: { text: '**Q.** What is $E[X]$ for $X\\sim\\text{Bernoulli}(p)$?' } }],
    back:  [{ type: 'text', props: { text: '**A.** $p$' } }],
    varieties: [{ name: 'Blue', accent: '#6ea8fe' }, { name: 'Mint', accent: '#54d6a0' }] },
  { id: 'ct_quiz', name: 'Quiz', store: 'practice',
    slots: [
      { type: 'text', props: { text: 'Var of a fair coin flip (0/1)?' } },
      { type: 'choice', props: { options: ['0.25', '0.5', '1'], answer: [0], multi: false } }] },
  { id: 'ct_note', name: 'Note', store: 'write', verbs: { bare: true },
    slots: [{ type: 'text', props: { text: '**Note.** Write anything — renders as bare script, no card frame. Math: P(A∩B)=P(A)P(B) when independent.' } }] },
  { id: 'ct_tracker', name: 'Tracker', store: 'practice',
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
      { type: 'slider', props: { key: 'rate', min: 0, max: 20, value: 5, step: 0.5 } },
      { type: 'slider', props: { key: 'years', min: 0, max: 40, value: 10, step: 1 } },
      { type: 'compute', props: { expr: 'round(1000*pow(1+rate/100, years))', out: 'fv', note: 'future value of $1000 =' } },
      { type: 'chart', props: { fn: '1000*pow(1 + rate/100, x)', x0: 0, x1: 40, label: '$1000 over the years' } }] },
  { id: 'ct_quizcard', name: 'Quiz Card', store: 'practice', verbs: { flip: true },
    slots: [{ type: 'text', props: { text: '**Q.** Var of a fair coin flip (0/1)?' } }],
    back: [
      { type: 'text', props: { text: 'Pick the variance:' } },
      { type: 'choice', props: { options: ['0.25', '0.5', '1'], answer: [0], multi: false } }] },
];
