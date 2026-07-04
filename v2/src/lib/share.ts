import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { exportNotebook, importNotebook, validateNotebookJSON } from './json-io';
import type { NotebookJSON } from './json-io';
import type { Notebook } from './types';

export type ImportResult = { notebook: Notebook } | { error: string } | { cancelled: true };
export type ExportResult = { path: string } | { error: string } | { cancelled: true };

const JSON_FILTER = [{ name: 'Notebook JSON', extensions: ['json'] }];

/** File → Import: pick a JSON file, validate, and return it as a new notebook. */
export async function importNotebookFromFile(): Promise<ImportResult> {
  const path = await open({ multiple: false, directory: false, filters: JSON_FILTER });
  if (typeof path !== 'string') return { cancelled: true };

  let text: string;
  try {
    text = await readTextFile(path);
  } catch (e) {
    return { error: `Could not read file: ${message(e)}` };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { error: `File is not valid JSON: ${message(e)}` };
  }

  const errors = validateNotebookJSON(json);
  if (errors.length > 0) return { error: `Invalid notebook file:\n${errors.join('\n')}` };

  try {
    return { notebook: importNotebook(json as NotebookJSON) };
  } catch (e) {
    return { error: `Import failed: ${message(e)}` };
  }
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
