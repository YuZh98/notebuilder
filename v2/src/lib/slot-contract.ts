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

/** Edit-mode component contract: receives props, an update callback, and the card scope */
export type EditComponent<P extends SlotProps> = Component<{
  props: P;
  onUpdate: (props: P) => void;
  scope?: Scope;
}>;

/** The contract every slot type must implement */
export interface SlotType<P extends SlotProps = SlotProps> {
  type: string;
  kind: 'write' | 'interact' | 'compute' | 'track';
  completable: boolean;

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

  /** Validate props, return errors */
  validate?(props: P): string[];

  /** Migrate old props to current schema */
  migrate?(old: unknown, version: number): P;

  /** Svelte component for Edit mode */
  renderEdit: EditComponent<P>;

  /** Svelte component for Study mode */
  renderStudy: StudyComponent<P>;
}
