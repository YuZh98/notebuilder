import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { exportNotebook, importNotebook, validateNotebook } from './json-io';
import type { NotebookJSON } from './json-io';
import { injectNotebook, extractNotebook, type ReaderPayload } from './html-io';
import { READER_TEMPLATE } from './generated/reader-template';
import { isTauri } from './db';
import type { Notebook } from './types';

export type ImportResult =
  | { notebook: Notebook; warnings: string[] }
  | { error: string }
  | { cancelled: true };
export type ExportResult = { path: string } | { error: string } | { cancelled: true };

const JSON_FILTER = [{ name: 'Notebook JSON', extensions: ['json'] }];
const HTML_FILTER = [{ name: 'Shared Notebook (HTML)', extensions: ['html'] }];
const IMPORT_FILTER = [{ name: 'Notebook', extensions: ['json', 'html'] }];

/** Build a self-contained, interactive Reader HTML file embedding this notebook's document layer. */
export function buildShareHtml(notebook: Notebook, theme?: string): string {
  const payload: ReaderPayload = {
    shared: true,
    // exportNotebook is the document-only path: no readerState, no progress, no local fold state.
    notebook: exportNotebook(notebook),
    ...(theme ? { theme } : {}),
  };
  return injectNotebook(READER_TEMPLATE, JSON.stringify(payload));
}

/** File → Import: pick a JSON or shared-HTML file, validate, and return it as a new notebook. */
export async function importNotebookFromFile(): Promise<ImportResult> {
  const path = await open({ multiple: false, directory: false, filters: IMPORT_FILTER });
  if (typeof path !== 'string') return { cancelled: true };

  let text: string;
  try {
    text = await readTextFile(path);
  } catch (e) {
    return { error: `Could not read file: ${message(e)}` };
  }

  let json: unknown;
  try {
    json = path.toLowerCase().endsWith('.html') ? payloadFromHtml(text) : JSON.parse(text);
  } catch (e) {
    return { error: `Could not read notebook: ${message(e)}` };
  }

  const { errors, warnings } = validateNotebook(json);
  if (errors.length > 0) return { error: `Invalid notebook file:\n${errors.join('\n')}` };

  try {
    return { notebook: importNotebook(json as NotebookJSON), warnings };
  } catch (e) {
    return { error: `Import failed: ${message(e)}` };
  }
}

/** A shared .html file embeds a ReaderPayload; the importable notebook is its `.notebook`. */
function payloadFromHtml(html: string): NotebookJSON {
  const raw = extractNotebook(html);
  if (!raw) throw new Error('no embedded notebook found in this HTML file');
  return (JSON.parse(raw) as ReaderPayload).notebook;
}

/** Share: write a self-contained interactive HTML file (Tauri save dialog, or browser download). */
export async function shareNotebookToFile(notebook: Notebook, theme?: string): Promise<ExportResult> {
  const html = buildShareHtml(notebook, theme);
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

function downloadInBrowser(html: string, name: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** File → Export: serialize the notebook (document layer only) and write it where the user picks. */
export async function exportNotebookToFile(notebook: Notebook): Promise<ExportResult> {
  const path = await save({ defaultPath: `${notebook.name}.json`, filters: JSON_FILTER });
  if (typeof path !== 'string') return { cancelled: true };

  try {
    await writeTextFile(path, JSON.stringify(exportNotebook(notebook), null, 2));
    return { path };
  } catch (e) {
    return { error: `Could not write file: ${message(e)}` };
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
