import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Share is the product's whole point — it reads as the primary action, set apart from the
// secondary JSON/print utilities.

test.beforeEach(async ({ page }) => { await open(page); });

test('Share is a primary button, separated from the muted utility group', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D(); D.place = 'house'; window.render();
    const share = document.querySelector('#top [data-act="camera"]');
    const grp = document.querySelector('#top .util-grp');
    return {
      primary: !!share && share.classList.contains('primary'),
      notSmall: !!share && !share.classList.contains('sm'),   // larger than the utility icons
      utilsGrouped: !!grp && !!grp.querySelector('[data-act="export"]') && !!grp.querySelector('[data-act="pdf"]'),
      shareOutsideGroup: !!share && !share.closest('.util-grp'),
    };
  });
  expect(out.primary).toBe(true);
  expect(out.notSmall).toBe(true);
  expect(out.utilsGrouped).toBe(true);
  expect(out.shareOutsideGroup).toBe(true);
});
