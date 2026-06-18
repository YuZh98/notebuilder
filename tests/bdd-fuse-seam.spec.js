import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Fuse is controlled from the selected slot's side panel: a labelled toggle (fuse/unfuse with next)
// and, when fused, a split slider.

test.beforeEach(async ({ page }) => { await open(page); });

function bench3() {
  return `window.LS.reset(); const D=window.LS.DB(); D.place='factory'; D.factory.study=false; window.render();
    ['text','text','text'].forEach(t=>document.querySelector('[data-act="addslot"][data-t="'+t+'"]').click());`;
}

test('selecting a non-last slot shows a labelled fuse toggle in the side panel; the last shows none', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${bench3()}
    document.querySelector('[data-bs="0"]').click();
    const tog0 = document.querySelector('#side [data-act="fusetoggle"]');
    const label = tog0 ? tog0.textContent.trim().toLowerCase() : '';
    document.querySelector('[data-bs="2"]').click();   // last slot
    const togLast = document.querySelector('#side [data-act="fusetoggle"]');
    return { hasOn0: !!tog0, label, hasOnLast: !!togLast };
  })()`);
  expect(out.hasOn0).toBe(true);
  expect(out.label).toContain('fuse');     // labelled, not a bare glyph
  expect(out.hasOnLast).toBe(false);       // last slot can't fuse with a next
});

test('the side-panel toggle fuses with the next slot and unfuses again', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${bench3()}
    document.querySelector('[data-bs="0"]').click();
    document.querySelector('#side [data-act="fusetoggle"][data-i="0"]').click();
    const fused = !!D.bench.slots[0].fuse;
    const hasFuseEl = !!document.querySelector('.benchfuse');
    document.querySelector('[data-bs="0"]').click();
    document.querySelector('#side [data-act="fusetoggle"][data-i="0"]').click();
    return { fused, hasFuseEl, unfused: !D.bench.slots[0].fuse };
  })()`);
  expect(out.fused).toBe(true);
  expect(out.hasFuseEl).toBe(true);
  expect(out.unfused).toBe(true);
});

test('a fused slot shows a split slider that sets the ratio', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${bench3()}
    D.bench.slots[0].fuse=true; window.render();
    document.querySelector('[data-bs="0"]').click();
    const slider = document.querySelector('#side [data-act="fuseratio"]');
    const present = !!slider;
    if(slider){ slider.value='75'; slider.dispatchEvent(new Event('input',{bubbles:true})); }
    const a=D.bench.slots[0].fuseW||1, b=D.bench.slots[1].fuseW||1;
    return { present, leftBigger: a > b };
  })()`);
  expect(out.present).toBe(true);
  expect(out.leftBigger).toBe(true);   // 75% → left cell wider
});

test('the bench slot header no longer carries a fuse button', async ({ page }) => {
  const has = await page.evaluate(`(() => { ${bench3()}
    return !!document.querySelector('.bench-grid .bs-head [data-act="fusetoggle"]');
  })()`);
  expect(has).toBe(false);
});
