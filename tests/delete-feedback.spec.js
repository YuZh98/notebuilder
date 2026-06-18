import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('panel card delete and item delete both announce the undo escape hatch', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const list = m.card('cl', 'L', [{ id: 's1', type: 'list', props: { items: 'a\nb', style: 'bullets' }, verbs: {} }], { w: 8 });
    const note = m.card('cn', 'N', [m.slot('s2', 'text', { text: 'x' })], { w: 8 });
    m.setHouse([m.room('r', 'R', [list, note])], [], false);
    const toastText = () => (document.querySelector('#toast,.toast') || {}).textContent || '';
    document.querySelector('[data-fid="cl"] [data-act="coptdel"][data-i="0"]').click();
    const itemToast = toastText();
    document.querySelector('[data-fid="cn"]').click();                 // select → panel
    document.querySelector('[data-act="delfurn"]').click();
    const cardToast = toastText();
    return { itemToast, cardToast, cardGone: D.house.rooms[0].cards.length === 1 };
  });
  expect(out.itemToast.toLowerCase()).toContain('undo');
  expect(out.cardToast.toLowerCase()).toContain('undo');
  expect(out.cardGone).toBe(true);
});
