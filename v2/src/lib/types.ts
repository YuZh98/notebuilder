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
  accent?: string;
  /** Card width in twelfths of the section grid (default 12); written by the resize engine. */
  w?: number;
  /** D20 — card is archived (hidden from the study grid unless the archive view is toggled on). */
  archived?: boolean;
  /**
   * D2d — made by AI and not yet reviewed by the author (absent, never `false`, once reviewed).
   * Local authoring state like Section.folded: persisted in the DB, never exported to interchange
   * JSON or a shared file, and never set by an import.
   */
  draft?: boolean;
};

/** A section within a notebook. `kind: 'divider'` marks a chapter break — dividers hold no cards. */
export type Section = {
  id: string;
  notebookId: string;
  name: string;
  position: number;
  cards: Card[];
  kind?: 'divider';
  locked?: boolean;
  width?: number;
  title?: string;
  subtitle?: string;
  /** Local-only fold state — persisted in the DB, never exported to interchange JSON. */
  folded?: boolean;
  /** Enabled service-bar features, keyed by ServiceKey (e.g. `{ search: true, shuffle: true }`). */
  services?: Record<string, boolean>;
  /** Custom left-to-right order of service-bar items; keys absent here fall back to registry order. */
  svcOrder?: string[];
  /** Per-service pixel widths for the resizable bar items, keyed by ServiceKey. */
  svcW?: Record<string, number>;
};

/** A notebook — the top-level container */
export type Notebook = {
  /** Author-controlled tag identity and order (D26) — first element is the first chip. */
  cats?: string[];
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
  subtitle?: string;
  width?: 'narrow' | 'medium' | 'wide';
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
