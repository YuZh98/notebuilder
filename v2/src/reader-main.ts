import { mount } from 'svelte';
import Reader from './lib/components/Reader.svelte';
import { readBoot, renderBootError } from './lib/reader-boot';
import './app.css';
import 'katex/dist/katex.min.css';

// A file that can't be read (damaged, invalid, from a newer NoteBuilder) or a Reader that fails to
// mount must still explain itself: throwing here would show every student a blank page.
function start(): ReturnType<typeof mount> | undefined {
  try {
    return mount(Reader, { target: document.getElementById('app')!, props: readBoot(document) });
  } catch (e) {
    console.error(e);
    renderBootError(document, e);
    return undefined;
  }
}

const app = start();

export default app;
