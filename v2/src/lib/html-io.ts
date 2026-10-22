import type { NotebookJSON } from './json-io';

export const PAYLOAD_ID = 'notebook-source';
export const PAYLOAD_TYPE = 'application/notebuilder+json';

/**
 * Embedded share payload. T6's share.ts produces this; the Reader boots from it. `docId` is the
 * author's notebook id at share time — envelope only (the interchange JSON carries no ids); the
 * Reader namespaces each student's locally saved progress by it. Absent in pre-docId files.
 */
export type ReaderPayload = { shared: boolean; notebook: NotebookJSON; theme?: string; docId?: string };

// Match the payload <script> by its id, tolerant of attribute order, capturing its inner text.
// The `\s` before `id=` guards against matching a longer attribute that merely ends in `id`.
const PAYLOAD_RE = /(<script\b[^>]*\sid="notebook-source"[^>]*>)([\s\S]*?)(<\/script>)/i;

/**
 * Embed a JSON string as the payload script's content. Every `<`, `>` and `&` becomes its JSON
 * `\u` escape (see escapePayload), so nothing in the notebook can steer the HTML tokenizer.
 */
export function injectNotebook(template: string, json: string): string {
  if (!PAYLOAD_RE.test(template)) {
    throw new Error(`injectNotebook: no <script id="${PAYLOAD_ID}"> placeholder in template`);
  }
  const escaped = escapePayload(json);
  return template.replace(PAYLOAD_RE, (_m, open: string, _inner: string, close: string) => open + escaped + close);
}

/** Read the payload JSON string from a rendered Document or an HTML string; null when absent. */
export function extractNotebook(docOrHtml: Document | string): string | null {
  if (typeof docOrHtml === 'string') {
    const m = PAYLOAD_RE.exec(docOrHtml);
    return m ? unescapePayload(m[2]) : null;
  }
  const el = docOrHtml.getElementById(PAYLOAD_ID);
  if (!el || el.getAttribute('type') !== PAYLOAD_TYPE) return null;
  return unescapePayload(el.textContent ?? '');
}

// Escaping only `</` is not enough: `<!--` followed by `<script` (with no `-->`) puts the HTML
// tokenizer into script-data-double-escaped state, where the real </script> no longer ends the
// element — the payload swallows the app code after it and the shared file opens blank. So no
// `<` may reach the page at all. `<`, `>` and `&` only ever occur inside JSON strings, where the
// `\u003c` / `\u003e` / `\u0026` escapes are equivalent, so JSON.parse restores them unchanged.
const PAYLOAD_ESCAPES: Record<string, string> = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' };
const escapePayload = (s: string): string => s.replace(/[<>&]/g, (c) => PAYLOAD_ESCAPES[c]);
// Files shared before that fix escaped `</` as `<\/`; keep reading them. A current payload holds
// no `<` at all, so this never touches one.
const unescapePayload = (s: string): string => s.replace(/<\\\//g, '</');
