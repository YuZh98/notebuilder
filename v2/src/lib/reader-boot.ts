// Reader boot: read the shared file's embedded payload into Reader props, and — when that fails —
// put a readable explanation on the page instead of leaving every student a blank file.
import { extractNotebook } from './html-io';
import { importNotebook, validateNotebookJSON, type NotebookJSON } from './json-io';
import { loadProgress, readerDocRef, readerStorageKey, type LoadedProgress } from './reader-store';
import type { Notebook } from './types';

export type ReaderBoot = {
  notebook: Notebook;
  shared: boolean;
  initialTheme?: string;
  docId: string;
  storageKey?: string;
  initialState?: LoadedProgress;
};

/** Why a shared file could not be opened: one plain-language reason plus detail lines. */
export class ReaderBootError extends Error {
  readonly reason: string;
  readonly details: string[];
  constructor(reason: string, details: string[] = []) {
    super([reason, ...details].join('\n'));
    this.name = 'ReaderBootError';
    this.reason = reason;
    this.details = details;
  }
}

export const BOOT_ERROR_TITLE = "This notebook file can't be opened";
/** Validation can report hundreds of issues; the page shows the first few and counts the rest. */
export const BOOT_ERROR_MAX_DETAILS = 5;

const DAMAGED = 'The notebook data inside this file is damaged.';
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Extract, parse, validate and import the embedded payload. Throws ReaderBootError on any failure. */
export function readBoot(doc: Document): ReaderBoot {
  const raw = extractNotebook(doc);
  if (!raw) throw new ReaderBootError('No notebook is embedded in this file.');
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    throw new ReaderBootError(DAMAGED, [messageOf(e)]);
  }
  if (!isRecord(payload)) throw new ReaderBootError(DAMAGED, ['the embedded data is not a notebook']);
  const errors = validateNotebookJSON(payload.notebook);
  if (errors.length > 0) throw new ReaderBootError('The notebook in this file has problems:', errors);
  let notebook: Notebook;
  try {
    notebook = importNotebook(payload.notebook as NotebookJSON);
  } catch (e) {
    throw new ReaderBootError('This file was made in a way this Reader cannot open:', [messageOf(e)]);
  }
  const shared = payload.shared !== false;
  const initialTheme = typeof payload.theme === 'string' ? payload.theme : undefined;
  const docId = readerDocRef(payload.docId, raw);
  if (!shared) return { notebook, shared, initialTheme, docId };
  // Progress belongs to the locked original: load it synchronously so the first paint has it.
  const storageKey = readerStorageKey(docId);
  return { notebook, shared, initialTheme, docId, storageKey, initialState: loadProgress(storageKey, notebook) };
}

/**
 * Replace the Reader's mount point (or the body) with a small error page. Built from plain DOM
 * nodes and `textContent` only: the details can carry payload text and must never be markup.
 */
export function renderBootError(doc: Document, err: unknown): void {
  const { reason, details } =
    err instanceof ReaderBootError
      ? err
      : { reason: 'Something went wrong while opening it:', details: [messageOf(err)] };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, css?: string) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (css) node.style.cssText = css;
    return node;
  };

  const page = el(
    'main',
    undefined,
    'max-width:640px;margin:0 auto;padding:40px 20px;line-height:1.5;overflow-wrap:anywhere',
  );
  page.dataset.bootError = '';
  page.setAttribute('role', 'alert');
  page.append(el('h1', BOOT_ERROR_TITLE, 'font-size:22px;margin:0 0 12px'), el('p', reason, 'margin:0 0 8px'));

  if (details.length > 0) {
    const list = el('ul', undefined, 'margin:0 0 16px;padding-left:20px;font-size:13px;opacity:0.85');
    for (const d of details.slice(0, BOOT_ERROR_MAX_DETAILS)) list.append(el('li', d));
    const more = details.length - BOOT_ERROR_MAX_DETAILS;
    if (more > 0) list.append(el('li', `…and ${more} more`));
    page.append(list);
  }
  page.append(el('p', 'Ask the author to re-share it.', 'margin:0;font-weight:600'));

  (doc.getElementById('app') ?? doc.body).replaceChildren(page);
  doc.title = "Can't open this notebook — NoteBuilder";
}
