/**
 * Well-formed UTF-16 text. JSON.parse accepts a lone surrogate ("\ud83e"), but such a string has
 * no UTF-8 form: SQLite's json_extract turns it into invalid bytes and the Tauri IPC rejects it,
 * after which every save of that notebook fails. Lone halves become U+FFFD; real pairs (emoji and
 * other astral characters) are kept.
 *
 * Hand-rolled rather than String.prototype.toWellFormed (missing in older WebKit), and with no
 * regex lookbehind (a parse error in older WebKit, which would break the whole bundle).
 */

// A pair first, so a lone half is all the second alternative ever sees. No `u` flag: code units.
const SURROGATES = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;
const ANY_SURROGATE = /[\uD800-\uDFFF]/;
// JSON.stringify writes a lone surrogate, and no other code unit in that range, as "\udXXX".
const LONE_ESCAPE = /\\ud[89a-f]/;

/** `s` with every lone surrogate replaced by U+FFFD. Non-strings pass through (runtime defence). */
export function wellFormed(s: string): string {
  if (typeof s !== 'string' || !ANY_SURROGATE.test(s)) return s;
  return s.replace(SURROGATES, (m) => (m.length === 2 ? m : '�'));
}

/**
 * A copy of parsed JSON with every string — object keys included — made well-formed. The input
 * is never mutated. Keys are defined, not assigned, so a "__proto__" key stays plain data.
 */
export function wellFormedDeep<T>(value: T): T {
  if (typeof value === 'string') return wellFormed(value) as T;
  if (Array.isArray(value)) return value.map((v) => wellFormedDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      Object.defineProperty(out, wellFormed(k), { value: wellFormedDeep(v), enumerable: true, writable: true, configurable: true });
    }
    return out as T;
  }
  return value;
}

/**
 * JSON.stringify of `value` with every string in it made well-formed first. Plain JSON.stringify
 * would keep a lone surrogate as a "\udXXX" escape, which JSON.parse and SQLite's json_extract
 * decode straight back. The copy is only made when such an escape appears.
 */
export function wellFormedJson(value: unknown): string {
  const text = JSON.stringify(value);
  return LONE_ESCAPE.test(text) ? JSON.stringify(wellFormedDeep(value)) : text;
}
