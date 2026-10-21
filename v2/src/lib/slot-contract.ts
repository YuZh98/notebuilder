import type { SlotProps, VarDeclaration } from './types';
import type { Scope } from './variable-graph';
import type { Component } from 'svelte';

/** Study-mode component contract: receives resolved props, the card scope, and optional reader state */
export type StudyComponent<P extends SlotProps> = Component<{
  props: P;
  scope?: Scope;
  state?: Record<string, unknown>;
  onState?: (next: Record<string, unknown>) => void;
}>;

/**
 * Edit-mode component contract: receives props, an update callback, and the card scope.
 * `state`/`onState` expose the same reader-state channel Study mode uses — Edit-mode
 * structural changes (e.g. reordering checklist items) must remap reader ticks with them.
 */
export type EditComponent<P extends SlotProps> = Component<{
  props: P;
  onUpdate: (props: P) => void;
  scope?: Scope;
  state?: Record<string, unknown>;
  onState?: (next: Record<string, unknown>) => void;
}>;

/**
 * One graded slot's result for the results export. A slot is ONE question: `answered` and
 * `correct` are each 0 or 1 (correct only if answered), and results.ts drops any other value
 * rather than add tries to answers. A slot that can be practised over and over reports its raw
 * counts as `practice` instead, which the export tallies apart from the questions.
 */
export type SlotScore = {
  correct: number;
  answered: number;
  practice?: { correct: number; attempts: number };
};

/** The contract every slot type must implement */
export interface SlotType<P extends SlotProps = SlotProps> {
  type: string;
  kind: 'write' | 'interact' | 'compute' | 'track';
  completable: boolean;

  /**
   * Which layer this slot's Study-mode `onState` writes belong to. `'progress'` (the default)
   * is readerState: persisted, exported, keyed by slot id. `'session'` is v1's LIVE layer:
   * keyed by variable name, wiped on every Study entry, never persisted or exported.
   */
  stateLayer?: 'progress' | 'session';

  /** Factory: returns default props for a new slot instance */
  create(): P;

  /** Declared variable interface. Writes with a `default` seed the card scope. */
  variables(props: P): { reads: VarDeclaration[]; writes: VarDeclaration[] };

  /**
   * Compute the values of this slot's declared writes from the current scope.
   * Slots that define this become variable-graph nodes; writer slots without it
   * are scope seeds via their write defaults.
   */
  evaluate?(props: P, scope: Scope): Scope;

  /** Progress tracking — only required if completable */
  isDone?(props: P, state: Record<string, unknown>): boolean;
  /** Graded result for results export (see SlotScore); null when the slot has no answer key. */
  score?(props: P, state: Record<string, unknown> | undefined): SlotScore | null;

  /** Validate props, return errors */
  validate?(props: P): string[];

  /** Migrate old props to current schema */
  migrate?(old: unknown, version: number): P;

  /** Svelte component for Edit mode */
  renderEdit: EditComponent<P>;

  /** Svelte component for Study mode */
  renderStudy: StudyComponent<P>;
}
