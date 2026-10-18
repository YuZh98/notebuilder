import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { exportNotebook, importNotebook, validateNotebook } from './json-io';
import type { NotebookJSON } from './json-io';
import { injectNotebook, extractNotebook, type ReaderPayload } from './html-io';
import { READER_TEMPLATE } from './generated/reader-template';
import { isTauri } from './db';
import { checkNotebookText, type CheckResult } from './import-hints';
import type { Notebook } from './types';

export type ImportResult =
  | { notebook: Notebook; warnings: string[] }
  /** `report`: the same problems with paths and fix hints, for ImportReport (absent for I/O errors). */
  | { error: string; report?: CheckResult }
  | { cancelled: true };
export type ExportResult = { path: string } | { error: string } | { cancelled: true };

const JSON_FILTER = [{ name: 'Notebook JSON', extensions: ['json'] }];
const HTML_FILTER = [{ name: 'Shared Notebook (HTML)', extensions: ['html'] }];
const IMPORT_FILTER = [{ name: 'Notebook', extensions: ['json', 'html'] }];

/**
 * The identity a shared file's students' progress is saved under: this install's random id plus
 * the notebook id. Stable across re-shares of one notebook (students keep their progress), and
 * distinct across installs even for the same notebook id (every install's demo is 'nb_demo').
 */
export function shareDocId(installId: string, notebookId: string): string {
  return `${installId}:${notebookId}`;
}

/**
 * Build a self-contained, interactive Reader HTML file embedding this notebook's document layer.
 * `docId` defaults to the bare notebook id; the app passes shareDocId(installId, notebook.id).
 */
export function buildShareHtml(notebook: Notebook, theme?: string, docId: string = notebook.id): string {
  const payload: ReaderPayload = {
    shared: true,
    // exportNotebook is the document-only path: no readerState, no progress, no local fold state.
    notebook: exportNotebook(notebook),
    // Envelope-only identity: lets a re-shared, edited copy keep students' saved progress.
    docId,
    ...(theme ? { theme } : {}),
  };
  return injectNotebook(READER_TEMPLATE, JSON.stringify(payload));
}

export type FilePicker = () => Promise<File | null>;

/**
 * File → Import: pick a JSON or shared-HTML file, validate, and return it as a new notebook.
 * Inside Tauri this uses the native open dialog; in a plain browser it falls back to a hidden
 * `<input type=file>` (injectable as `pick` for tests, mirroring shareNotebookToFile's branch).
 */
export async function importNotebookFromFile(pick: FilePicker = pickFileInBrowser): Promise<ImportResult> {
  if (!isTauri()) {
    const file = await pick();
    if (!file) return { cancelled: true };
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      return { error: `Could not read file: ${message(e)}` };
    }
    return importFromText(text, file.name.toLowerCase().endsWith('.html'));
  }

  const path = await open({ multiple: false, directory: false, filters: IMPORT_FILTER });
  if (typeof path !== 'string') return { cancelled: true };

  let text: string;
  try {
    text = await readTextFile(path);
  } catch (e) {
    return { error: `Could not read file: ${message(e)}` };
  }
  return importFromText(text, path.toLowerCase().endsWith('.html'));
}

/** Parse (JSON or embedded-HTML payload), validate, and import notebook text. */
function importFromText(text: string, isHtml: boolean): ImportResult {
  let json: unknown;
  try {
    json = isHtml ? payloadFromHtml(text) : JSON.parse(text);
  } catch (e) {
    return { error: `Could not read notebook: ${message(e)}`, report: isHtml ? undefined : checkNotebookText(text) };
  }

  const { errors, warnings } = validateNotebook(json);
  if (errors.length > 0) {
    return {
      error: `Invalid notebook file:\n${errors.join('\n')}`,
      report: checkNotebookText(isHtml ? JSON.stringify(json, null, 2) : text),
    };
  }

  try {
    return { notebook: importNotebook(json as NotebookJSON), warnings };
  } catch (e) {
    return { error: `Import failed: ${message(e)}` };
  }
}

/** Browser file-open: a transient hidden input resolving to the chosen file (or null on cancel). */
function pickFileInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.html';
    input.style.display = 'none';
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** A shared .html file embeds a ReaderPayload; the importable notebook is its `.notebook`. */
function payloadFromHtml(html: string): NotebookJSON {
  const raw = extractNotebook(html);
  if (!raw) throw new Error('no embedded notebook found in this HTML file');
  return (JSON.parse(raw) as ReaderPayload).notebook;
}

/** Share: write a self-contained interactive HTML file (Tauri save dialog, or browser download). */
export async function shareNotebookToFile(notebook: Notebook, theme?: string, docId?: string): Promise<ExportResult> {
  const html = buildShareHtml(notebook, theme, docId);
  const name = `${notebook.name}.html`;
  if (!isTauri()) {
    downloadInBrowser(html, name);
    return { path: name };
  }
  const path = await save({ defaultPath: name, filters: HTML_FILTER });
  if (typeof path !== 'string') return { cancelled: true };
  try {
    await writeTextFile(path, html);
    return { path };
  } catch (e) {
    return { error: `Could not write file: ${message(e)}` };
  }
}

function downloadInBrowser(text: string, name: string, mime = 'text/html'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * File → Export: serialize the notebook (document layer only) and write it out. Inside Tauri
 * this opens the native save dialog; in a plain browser it downloads via a blob anchor.
 */
export async function exportNotebookToFile(notebook: Notebook): Promise<ExportResult> {
  const json = JSON.stringify(exportNotebook(notebook), null, 2);
  const name = `${notebook.name}.json`;
  if (!isTauri()) {
    downloadInBrowser(json, name, 'application/json');
    return { path: name };
  }
  const path = await save({ defaultPath: name, filters: JSON_FILTER });
  if (typeof path !== 'string') return { cancelled: true };

  try {
    await writeTextFile(path, json);
    return { path };
  } catch (e) {
    return { error: `Could not write file: ${message(e)}` };
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
