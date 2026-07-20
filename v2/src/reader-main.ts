import { mount } from 'svelte';
import Reader from './lib/components/Reader.svelte';
import { extractNotebook, type ReaderPayload } from './lib/html-io';
import { importNotebook, validateNotebookJSON, type NotebookJSON } from './lib/json-io';
import type { Notebook } from './lib/types';
import './app.css';
import 'katex/dist/katex.min.css';

function boot(): { notebook: Notebook; shared: boolean } {
  const raw = extractNotebook(document);
  if (!raw) throw new Error('Reader: no embedded notebook payload found');
  const payload = JSON.parse(raw) as ReaderPayload;
  const errors = validateNotebookJSON(payload.notebook as NotebookJSON);
  if (errors.length > 0) throw new Error(`Reader: invalid notebook payload:\n${errors.join('\n')}`);
  return { notebook: importNotebook(payload.notebook as NotebookJSON), shared: payload.shared !== false };
}

const app = mount(Reader, { target: document.getElementById('app')!, props: boot() });

export default app;
