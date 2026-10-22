import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { mode } from './lib/stores/mode';

const share = vi.hoisted(() => ({ next: null as unknown }));
vi.mock('./lib/share', async (orig) => ({
  ...(await orig<typeof import('./lib/share')>()),
  importNotebookFromFile: vi.fn(async () => share.next),
}));

import App from './App.svelte';
import { checkNotebookText } from './lib/import-hints';

const lesson = {
  version: 2,
  notebook: {
    name: 'Fractions from AI',
    sections: [{ name: 'Basics', cards: [{ slots: [{ type: 'text', props: { text: 'Half is $1/2$.' } }] }] }],
  },
};

async function openFromAi(container: HTMLElement) {
  await fireEvent.click(container.querySelector('button[title="New notebook"]')!);
  await fireEvent.click(await waitFor(() => container.querySelector('[data-new="ai"]')!));
  return waitFor(() => document.querySelector('.fromai')!);
}

afterEach(() => {
  cleanup();
  share.next = null;
});

describe('App — new notebook from AI', () => {
  it('pasting a valid reply and creating opens it as the current notebook', async () => {
    const { container } = render(App);
    const modal = await openFromAi(container);
    const reply = modal.querySelector('textarea[aria-label="AI reply"]') as HTMLTextAreaElement;
    await fireEvent.input(reply, { target: { value: '```json\n' + JSON.stringify(lesson) + '\n```' } });
    await fireEvent.click(modal.querySelector('[data-act="check"]')!);
    await fireEvent.click(modal.querySelector('[data-act="create"]')!);
    await tick();
    expect(document.querySelector('.fromai')).toBeNull();
    await waitFor(() => expect(container.textContent).toContain('Fractions from AI'));
  });

  it('app shortcuts do not fire behind the open modal', async () => {
    const { container } = render(App);
    const modal = await openFromAi(container);
    const before = get(mode);
    await fireEvent.keyDown(modal.querySelector('[data-act="check"]')!, { key: 'Enter', metaKey: true, ctrlKey: true });
    expect(get(mode)).toBe(before);
  });
});

describe('App — import problems are shown as a readable report', () => {
  it('an invalid file opens ImportReport with the problem and its fix hint', async () => {
    const text = JSON.stringify({ version: 2, notebook: { name: 'X', sections: [{ name: 'S', cards: [{ slots: [{ type: 'quizz', props: {} }] }] }] } });
    share.next = { error: 'Invalid notebook file:\nunknown slot type: quizz', report: checkNotebookText(text) };
    const { container } = render(App);
    await fireEvent.click(container.querySelector('button[title="Import a notebook JSON"]')!);
    const report = await waitFor(() => document.querySelector('.ir-item')!);
    expect(report.textContent).toMatch(/quizz/);
    expect(document.body.textContent).toMatch(/choice/); // did-you-mean hint
  });
});
