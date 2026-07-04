/** Variable declaration for a slot's reactive interface */
export type VarDeclaration = {
  key: string;
  type: 'number' | 'string' | 'boolean';
  default?: unknown;
};

/** Base slot props — each slot type extends this */
export type SlotProps = Record<string, unknown>;

/** Verb configuration on a slot */
export type VerbConfig = {
  reveal?: { key: string; op: '==' | '!=' | '>=' | '<=' | '>' | '<'; val: unknown };
  glow?: boolean;
  emphasis?: boolean;
  hint?: { content: string };
  sequential?: boolean;
  locked?: boolean;
};

/** A slot instance within a card */
export type Slot = {
  id: string;
  type: string;
  props: SlotProps;
  verbs?: VerbConfig;
  w?: number;
  fuse?: boolean;
  fuseW?: number;
};

/** A card instance within a section */
export type Card = {
  id: string;
  sectionId: string;
  typeId?: string;
  position: number;
  slots: Slot[];
  verbs?: { flip?: boolean; bare?: boolean };
  back?: Slot[];
  tags?: string[];
};

/** A section within a notebook */
export type Section = {
  id: string;
  notebookId: string;
  name: string;
  position: number;
  cards: Card[];
};

/** A notebook — the top-level container */
export type Notebook = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
};

/** Reader state for a card (local, never exported) */
export type CardState = Record<string, unknown>;

/** A reader's annotation on a card (local-only, never exported) */
export type Annotation = {
  id: string;
  cardId: string;
  kind: 'note' | 'highlight';
  body: string;
  createdAt: string;
};
