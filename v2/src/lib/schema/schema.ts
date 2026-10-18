/**
 * Typed access to the published notebook JSON Schema plus small readers over it, so the AI
 * prompt kit and the import hints describe the format from the one source of truth.
 *
 * Deliberately NOT imported by json-io.ts: the Reader bundle imports json-io, and the schema
 * (and everything built on it) must stay out of the Reader template.
 */
import schemaJson from './notebook.schema.json';

/** The subset of JSON Schema 2020-12 the notebook schema uses. */
export type JsonSchema = {
  $ref?: string;
  $comment?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  allOf?: Array<{ if?: JsonSchema; then?: JsonSchema }>;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  pattern?: string;
  $defs?: Record<string, JsonSchema>;
};

export const NOTEBOOK_SCHEMA = schemaJson as unknown as JsonSchema;

const defs = (): Record<string, JsonSchema> => NOTEBOOK_SCHEMA.$defs ?? {};

/** Follow a local `#/$defs/<name>` reference (one hop is all the schema needs). */
export function resolveRef(node: JsonSchema): JsonSchema {
  const m = node.$ref ? /^#\/\$defs\/(.+)$/.exec(node.$ref) : null;
  return m ? (defs()[m[1]] ?? node) : node;
}

/** A named definition, e.g. `schemaDef('card')`. */
export function schemaDef(name: string): JsonSchema | undefined {
  return defs()[name];
}

/** `text-input` → `textInputProps`: the $defs name of a slot type's props. */
export function propsDefName(type: string): string {
  return `${type.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase())}Props`;
}

/** The props schema for a slot type, or undefined when the schema does not know the type. */
export function slotPropsSchema(type: string): JsonSchema | undefined {
  return defs()[propsDefName(type)];
}

/** Slot types the schema accepts (its `type` enum). */
export function schemaSlotTypes(): string[] {
  const t = defs().slot?.properties?.type?.enum;
  return Array.isArray(t) ? t.map(String) : [];
}

/** A compact TypeScript-like rendering of a schema node: `string[]`, `"a" | "b"`, `{ k?: number }`. */
export function renderType(node: JsonSchema): string {
  // A reference to a structural def renders as its name (Section, CardVerbs, ...), not inline.
  const ref = node.$ref ? /^#\/\$defs\/(.+)$/.exec(node.$ref) : null;
  if (ref) return ref[1].charAt(0).toUpperCase() + ref[1].slice(1);
  const n = node;
  if (n.const !== undefined) return JSON.stringify(n.const);
  if (n.enum) return n.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (Array.isArray(n.type)) return n.type.join(' | ');
  if (n.type === 'array') {
    const inner = n.items ? renderType(n.items) : 'unknown';
    return inner.includes('|') || inner.includes(' ') ? `(${inner})[]` : `${inner}[]`;
  }
  if (n.type === 'object') {
    if (n.properties) {
      const req = new Set(n.required ?? []);
      const parts = Object.entries(n.properties).map(([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${renderType(v)}`);
      return `{ ${parts.join(', ')} }`;
    }
    if (n.additionalProperties && typeof n.additionalProperties === 'object') {
      return `{ [name]: ${renderType(n.additionalProperties)} }`;
    }
    return 'object';
  }
  return n.type ?? 'any';
}

function constraintNote(node: JsonSchema): string {
  const n = resolveRef(node);
  const notes: string[] = [];
  if (n.minimum !== undefined && n.maximum !== undefined) notes.push(`${n.minimum}–${n.maximum}`);
  else if (n.minimum !== undefined) notes.push(`≥ ${n.minimum}`);
  else if (n.exclusiveMinimum !== undefined && n.maximum !== undefined) notes.push(`> ${n.exclusiveMinimum}, ≤ ${n.maximum}`);
  else if (n.exclusiveMinimum !== undefined) notes.push(`> ${n.exclusiveMinimum}`);
  if (n.minItems !== undefined) notes.push(`at least ${n.minItems} items`);
  return notes.length ? ` (${notes.join('; ')})` : '';
}

/**
 * One line per property of an object schema: `name?: type (range) — description`.
 * `skip` leaves out keys the caller documents elsewhere.
 */
export function propertyLines(node: JsonSchema, skip: readonly string[] = []): string[] {
  const n = resolveRef(node);
  const req = new Set(n.required ?? []);
  return Object.entries(n.properties ?? {})
    .filter(([k]) => !skip.includes(k))
    .map(([k, v]) => {
      const desc = resolveRef(v).description ?? v.description;
      return `${k}${req.has(k) ? '' : '?'}: ${renderType(v)}${constraintNote(v)}${desc ? ` — ${desc}` : ''}`;
    });
}

/** Keys an object node allows, when it is closed (`additionalProperties: false`); else null. */
export function allowedKeys(node: JsonSchema): string[] | null {
  const n = resolveRef(node);
  return n.additionalProperties === false ? Object.keys(n.properties ?? {}) : null;
}
