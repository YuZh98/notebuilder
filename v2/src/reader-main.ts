import { mount } from 'svelte';
import Reader from './lib/components/Reader.svelte';
import { extractNotebook, type ReaderPayload } from './lib/html-io';
import { importNotebook, validateNotebookJSON, type NotebookJSON } from './lib/json-io';
import { loadProgress, readerDocRef, readerStorageKey, type LoadedProgress } from './lib/reader-store';
import type { Notebook } from './lib/types';
import './app.css';
import 'katex/dist/katex.min.css';

type ReaderBoot = {
  notebook: Notebook;
  shared: boolean;
  initialTheme?: string;
  docId: string;
  storageKey?: string;
  initialState?: LoadedProgress;
};

function boot(): ReaderBoot {
  const raw = extractNotebook(document);
  if (!raw) throw new Error('Reader: no embedded notebook payload found');
  const payload = JSON.parse(raw) as ReaderPayload;
  const errors = validateNotebookJSON(payload.notebook as NotebookJSON);
  if (errors.length > 0) throw new Error(`Reader: invalid notebook payload:\n${errors.join('\n')}`);
  const notebook = importNotebook(payload.notebook as NotebookJSON);
  const shared = payload.shared !== false;
  const docId = readerDocRef(payload.docId, raw);
  if (!shared) return { notebook, shared, initialTheme: payload.theme, docId };
  // Progress belongs to the locked original: load it synchronously so the first paint has it.
  const storageKey = readerStorageKey(docId);
  return {
    notebook,
    shared,
    initialTheme: payload.theme,
    docId,
    storageKey,
    initialState: loadProgress(storageKey, notebook),
  };
}

const app = mount(Reader, { target: document.getElementById('app')!, props: boot() });

export default app;
