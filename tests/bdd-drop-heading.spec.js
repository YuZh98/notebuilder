import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Heading dropped: a card needs no section heading; a Text slot (## …) covers a title. Old saves migrate.

test.beforeEach(async ({ page }) => { await open(page); });

test('the factory palette no longer offers Heading', async ({ page }) => {
  const slots = await page.evaluate(() => { window.__mk.D().place = 'factory'; window.render(); return [...document.querySelectorAll('[data-slotdrag]')].map(b => b.dataset.slotdrag); });
  expect(slots).not.toContain('heading');
  expect(slots).toContain('text');
});

test('a heading slot migrates to text and keeps its heading look (## prefix)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const h = { name: 'old', rooms: [{ id: 'r1', name: 'R', cards: [
      { id: 'f1', name: 'a', slots: [
        { id: 's1', type: 'heading', props: { text: 'Section title' }, verbs: {} },     // no ## → gets one
        { id: 's2', type: 'heading', props: { text: '## Already big' }, verbs: {} },     // already ## → unchanged
      ], place: { w: 12 }, content: {}, tag: [], state: {} },
    ] }] };
    window.importHouse(JSON.stringify(h));
    const D = window.__mk.D(); D.studyOn = true; window.render();
    const c = D.house.rooms[0].cards[0];
    return {
      types: c.slots.map(s => s.type),
      texts: c.slots.map(s => s.props.text),
      headingCount: document.querySelectorAll('[data-fid="f1"] h2, [data-fid="f1"] h3').length,
    };
  });
  expect(out.types).toEqual(['text', 'text']);
  expect(out.texts[0]).toBe('## Section title');   // heading look preserved as markdown (## → h3)
  expect(out.texts[1]).toBe('## Already big');      // not double-prefixed
  expect(out.headingCount).toBe(2);                  // both render as headings
});
