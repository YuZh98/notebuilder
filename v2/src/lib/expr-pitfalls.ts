/**
 * Formulas that parse but compute something else than an author (or an LLM) means. expr.ts
 * binds a leading minus tighter than ^ (-x^2 is (-x)^2, so exp(-x^2) explodes instead of a bell
 * curve), and it has no ** operator.
 *
 * Shared by the From AI check (import-hints) and the problem editor's inline warning. Imports
 * nothing, so the Reader bundle (which carries the slot editors) may include it.
 */

export type ExprPitfall = {
  kind: 'power-op' | 'negated-power';
  /** The offending text, e.g. `**` or `-x^`. */
  subject: string;
  /** For 'negated-power': the operand the minus binds to (`x` in `-x^2`). */
  name?: string;
  message: string;
  hint: string;
};

/** A minus at the start or after an operator / `(` / `,`, applied to a name or number that is then raised: `-x^2`. */
const NEGATED_POWER = /(?:^|[(,?:+\-*/%^=<>!&|])\s*-\s*([A-Za-z_]\w*|\d*\.?\d+)\s*\^/;

/** The pitfalls in one formula, at most one of each kind. */
export function exprPitfalls(src: string): ExprPitfall[] {
  const out: ExprPitfall[] = [];
  if (src.includes('**')) {
    out.push({
      kind: 'power-op',
      subject: '**',
      message: '** is not an operator in NoteBuilder formulas (the result is silently wrong)',
      hint: 'Write powers with ^: x^2, not x**2.',
    });
  }
  const m = NEGATED_POWER.exec(src);
  if (m) {
    const name = m[1];
    out.push({
      kind: 'negated-power',
      subject: `-${name}^`,
      name,
      message: `"-${name}^" raises (-${name}) to the power, not ${name}: a leading minus binds tighter than ^`,
      hint: 'Put the power in parentheses: -(x^2), e.g. exp(-(x^2)/2) for a bell curve.',
    });
  }
  return out;
}
