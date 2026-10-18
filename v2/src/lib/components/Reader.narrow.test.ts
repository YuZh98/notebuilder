// Phones: a shared lesson opens with the side panel closed (it holds little for a student, and
// open it left a 73px lesson column at 390px), and app.css lays the Reader out for the narrow
// screen — but only the Reader, and only below 761px, so desktop and the authoring App keep theirs.
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';
import Reader from './Reader.svelte';
import { mode } from '../stores/mode';
import type { Notebook } from '../types';

function nb(): Notebook {
  return {
    id: 'nb1',
    name: 'Phone Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      {
        id: 's1',
        notebookId: 'nb1',
        name: 'One',
        position: 0,
        cards: [{ id: 'c1', sectionId: 's1', position: 0, w: 6, slots: [{ id: 'x', type: 'text', props: { text: 'hi' } }] }],
      },
    ],
  };
}

const realWidth = window.innerWidth;
function viewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

afterEach(() => {
  viewport(realWidth);
  mode.set('edit');
  document.body.className = '';
  delete document.body.dataset.theme;
});

describe('Reader — the side panel on narrow screens', () => {
  it.each([320, 390, 760])('starts collapsed at %ipx wide', async (w) => {
    viewport(w);
    const { container } = render(Reader, { props: { notebook: nb(), shared: true } });
    await tick();
    expect(document.body.classList.contains('side-collapsed')).toBe(true);
    expect(document.getElementById('sidebump')?.getAttribute('title')).toBe('show the panel');
    expect(container.textContent).toContain('hi');
  });

  it.each([761, 1024, 1280])('starts open at %ipx wide (desktop unchanged)', async (w) => {
    viewport(w);
    render(Reader, { props: { notebook: nb(), shared: true } });
    await tick();
    expect(document.body.classList.contains('side-collapsed')).toBe(false);
    expect(document.getElementById('sidebump')?.getAttribute('title')).toBe('hide the panel');
  });

  it('the bump still opens the panel on a phone', async () => {
    viewport(390);
    render(Reader, { props: { notebook: nb(), shared: true } });
    await tick();
    await fireEvent.click(document.getElementById('sidebump')!);
    await tick();
    expect(document.body.classList.contains('side-collapsed')).toBe(false);
  });

  it('marks the body as the Reader while mounted, and clears it on unmount', async () => {
    viewport(1280);
    const { unmount } = render(Reader, { props: { notebook: nb(), shared: true } });
    await tick();
    expect(document.body.classList.contains('nb-reader')).toBe(true);
    unmount();
    expect(document.body.classList.contains('nb-reader')).toBe(false);
  });
});

describe('app.css — the narrow-screen rules', () => {
  const css: string = readFileSync('src/app.css', 'utf8');

  /** Bodies of every `@media (max-width: 760px)` block (balanced braces). */
  function narrowBlocks(): string[] {
    const out: string[] = [];
    const re = /@media\s*\(\s*max-width:\s*760px\s*\)\s*\{/g;
    for (let m = re.exec(css); m; m = re.exec(css)) {
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (depth > 0 && i < css.length) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        i++;
      }
      out.push(css.slice(start, i - 1));
    }
    return out;
  }

  /** Top-level selectors of a block body, nested at-rules (e.g. @supports) unwrapped. */
  function selectors(body: string): string[] {
    const flat = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@supports[^{]*\{([\s\S]*?\})\s*\}/g, '$1');
    return [...flat.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
  }

  it('exists, and the 760px breakpoint matches the Reader’s collapse threshold', () => {
    expect(narrowBlocks().length).toBeGreaterThan(0);
  });

  it('scopes every narrow rule to the Reader (body.nb-reader), so the App never changes', () => {
    const sels = narrowBlocks().flatMap(selectors);
    expect(sels.length).toBeGreaterThan(5);
    for (const s of sels) expect(s, s).toMatch(/^body\.nb-reader\b/);
  });

  it('collapses card and slot widths to full width and overlays the open panel', () => {
    const body = narrowBlocks().join('\n');
    expect(body).toMatch(/\.room-grid\s*>\s*\.furn\s*\{[^}]*flex-basis:\s*100%/);
    expect(body).toMatch(/\.cardrow\s*>\s*\.cardslot\s*\{[^}]*flex-basis:\s*100%/);
    expect(body).toMatch(/#side\s*\{[^}]*position:\s*absolute/);
    expect(body).toMatch(/#top\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  // A flex item's default min-width:auto is its min-content width: one long code line, URL or
  // wide table made its card — and, through the section grid, every card in that section — wider
  // than the phone, so the lesson scrolled sideways inside #stage (which the document-level
  // scrollWidth check cannot see). Cards must stay at the screen width; wide content scrolls or
  // wraps inside its own slot.
  it('keeps wide content (long code lines, URLs, tables, display math) from widening a card', () => {
    const body = narrowBlocks().join('\n');
    expect(body).toMatch(/\.rgwrap\s*>\s*\.room-grid\s*\{[^}]*min-width:\s*0/);
    expect(body).toMatch(/\.room-grid\s*>\s*\.furn\s*\{[^}]*min-width:\s*0/);
    expect(body).toMatch(/\.room-grid\s*>\s*\.furn\s*\{[^}]*overflow-wrap:\s*(?:anywhere|break-word)/);
    // the coverage matrix: a 80px row header plus a ≥42px column per tag outgrows a phone at
    // 5 tags (320px) or 7 (390px); it scrolls inside its own box rather than moving the lesson
    for (const wide of ['.table-study', '.katex-display', '.mtx']) {
      const re = new RegExp(`\\${wide}[^{}]*\\{[^}]*overflow-x:\\s*auto`);
      expect(body, wide).toMatch(re);
    }
  });
});
