import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('a variety picked on product A never leaks onto product B; repeat-placing A keeps the pick', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('r', 'R', [])], [], false);
    // product B shares a variety NAME with Flashcard
    D.products.push({ id: 'pb', name: 'Boxy', store: 'write', container: {}, rules: {}, accent: '#f0a500', note: '', icon: '',
      varieties: [{ name: 'Rose', accent: '#ff6b81' }, { name: 'Mint', accent: '#111111' }],
      slots: [{ id: 's1', w: 12, verbs: {}, type: 'text', props: { text: 'b' } }] });
    window.render();
    const fc = D.products.find(p => p.name === 'Flashcard');
    document.querySelector(`[data-act="selprod"][data-id="${fc.id}"]`).click();
    document.querySelector('#side [data-act="pickvariety"][data-v="Mint"]').click();
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click();
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click();   // repeat-place keeps Mint
    window.placeProduct('pb');                                       // B placed without ever being configured
    const cards = D.house.rooms[0].cards;
    return { a1: cards[0].variety, a2: cards[1].variety, b: cards[2].variety, bAccent: cards[2].accent };
  });
  expect(out.a1).toBe('Mint');
  expect(out.a2).toBe('Mint');                  // the pick survives repeated placement of the SAME product
  expect(out.b).toBe('Rose');                   // B falls back to ITS OWN first variety…
  expect(out.bAccent).toBe('#ff6b81');          // …not A's leaked 'Mint' pick that B also happens to define
});
