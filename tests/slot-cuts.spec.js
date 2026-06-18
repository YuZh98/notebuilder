import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('divider, link and board slots are gone from the palette and store; old saves load without them', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    // old-save simulation: a card carrying all three dead slot types plus a text slot
    const c = m.card('cm', 'Mixed', [
      { id: 's1', type: 'text', props: { text: 'keep me' }, verbs: {} },
      { id: 's2', type: 'divider', props: {}, verbs: {} },
      { id: 's3', type: 'link', props: { label: 'Go', target: 'Nowhere' }, verbs: {} },
      { id: 's4', type: 'board', props: { label: 'Pins', source: 'pinned' }, verbs: {} },
    ], { w: 12 });
    D.house.rooms[0].cards = [c];
    window.rebuildRefs(); D.studyOn = true; window.render();
    const slots = D.house.rooms[0].cards[0].slots.map(s => s.type);
    D.place = 'factory'; window.render();
    const palette = [...document.querySelectorAll('[data-slotdrag]')].map(b => b.dataset.slotdrag);
    const storeNames = D.products.map(p => p.name);
    return { slots, palette, storeNames, rendered: !!document.querySelector('[data-fid="cm"]') };
  });
  expect(out.slots).toEqual(['text']);                                   // dead slots stripped, content kept
  for (const t of ['divider', 'link', 'board']) expect(out.palette).not.toContain(t);
  for (const n of ['Divider', 'Link Tile', 'Pinned Board']) expect(out.storeNames).not.toContain(n);
});
