import type { Scope } from './variable-graph';
import type { VerbConfig } from './types';

/**
 * True when scope[reveal.key] satisfies the op/val predicate.
 * Returns false when the key is absent from scope.
 */
export function revealOk(
  reveal: NonNullable<VerbConfig['reveal']>,
  scope: Scope,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(scope, reveal.key)) return false;
  const a = scope[reveal.key];
  const b = reveal.val as number | boolean;
  switch (reveal.op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>=': return (a as number) >= (b as number);
    case '<=': return (a as number) <= (b as number);
    case '>':  return (a as number) >  (b as number);
    case '<':  return (a as number) <  (b as number);
  }
}

/**
 * A slot is visible unless:
 *   - it has a reveal whose condition is false, OR
 *   - sequential is true and priorComplete is false.
 */
export function shouldShow(
  verbs: VerbConfig | undefined,
  scope: Scope,
  priorComplete: boolean,
): boolean {
  if (verbs?.reveal && !revealOk(verbs.reveal, scope)) return false;
  if (verbs?.sequential && !priorComplete) return false;
  return true;
}

/**
 * A locked slot is disabled until all prior completable slots are done
 * (the same unified done concept sequential consumes — but disabled, not hidden).
 */
export function isLocked(
  locked: VerbConfig['locked'],
  priorComplete: boolean,
): boolean {
  return locked === true && !priorComplete;
}

/**
 * Space-joined CSS class string from glow/emphasis verb flags.
 */
export function verbClasses(verbs: VerbConfig | undefined): string {
  const classes: string[] = [];
  if (verbs?.glow)     classes.push('glow');
  if (verbs?.emphasis) classes.push('emphasis');
  return classes.join(' ');
}
