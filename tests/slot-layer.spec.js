import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('placing a product keeps its variable names when progress or {{interp}} text reads them', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    m.setHouse([m.room('r', 'R', [])], [], false);
    // a Slider-Lab-shaped product: slider + progress + interp text (NO compute/chart)
    D.products.push({ id: 'plab', name: 'Lab', container: { flip: false, look: 'card' }, rules: {}, accent: '', note: '', icon: '', store: 'live',
      slots: [
        { id: 's1', w: 12, verbs: {}, type: 'slider', props: { key: 'mu', min: 0, max: 100, value: 30, step: 1, showName: true, showValue: true, showSlider: true } },
        { id: 's2', w: 12, verbs: {}, type: 'progress', props: { label: 'reads mu', key: 'mu', max: 100, value: 0 } },
        { id: 's3', w: 12, verbs: {}, type: 'text', props: { text: 'live: {{mu}}' } },
      ] });
    window.render();
    document.querySelector('[data-act="selprod"][data-id="plab"]').click();
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click();
    const card = D.house.rooms[0].cards[0];
    const key = card.slots.find(s => s.type === 'slider').props.key;
    // placing twice keeps the SAME key in both copies — card scope makes them independent, no rename
    D.products.push({ id: 'psl', name: 'Plain', container: { flip: false, look: 'card' }, rules: {}, accent: '', note: '', icon: '', store: 'live',
      slots: [{ id: 's9', w: 12, verbs: {}, type: 'slider', props: { key: 'v', min: 0, max: 10, value: 5, step: 1, showName: true, showValue: true, showSlider: true } }] });
    window.render();
    for (let i = 0; i < 2; i++) { document.querySelector('[data-act="selprod"][data-id="psl"]').click();
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Place in')).click(); }
    const plainKeys = D.house.rooms[0].cards.slice(1).map(c => c.slots[0].props.key);
    return { wiredKey: key, plainKeys };
  });
  expect(out.wiredKey).toBe('mu');             // progress + interp keep their wire
  expect(out.plainKeys).toEqual(['v', 'v']);   // authored keys survive placement verbatim
});

test('a text slot parses block markdown headings (## makes a heading, not literal hashes)', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('ch', 'H', [{ id: 's1', type: 'text', props: { text: '## Big title $x^2$' }, verbs: {} }], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const el = document.querySelector('[data-fid="ch"] .slot.text');
    return { text: el.textContent, hasHashes: el.textContent.includes('##'), hasH: !!el.querySelector('h1,h2,h3'), math: !!el.querySelector('.katex') };
  });
  expect(out.hasHashes).toBe(false);
  expect(out.hasH).toBe(true);
  expect(out.math).toBe(true);
});
