import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Section-op chips in the side panel drag onto a room to enable, mirroring tags/verbs/products.
// Click-toggle stays the primary gesture (a service targets the whole room, not a point).

test.beforeEach(async ({ page }) => { await open(page); });

test('a section-op chip is draggable and carries its svc payload, like the other side controls', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    m.setHouse([m.room('r', 'R', [])], [], false);   // Edit
    const chip = document.querySelector('#side [data-act="svc"][data-k="shuffle"]');
    return {
      draggable: chip ? chip.getAttribute('draggable') : null,
      svcdrag: chip ? chip.dataset.svcdrag : null,
      stillToggles: chip ? chip.dataset.act : null,
    };
  });
  expect(out.draggable).toBe('true');
  expect(out.svcdrag).toBe('shuffle');     // emits the payload the room's drop handler already expects
  expect(out.stillToggles).toBe('svc');    // click-toggle preserved
});

test('dropping a section-op chip onto a room enables that service', async ({ page }) => {
  const enabled = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    m.setHouse([m.room('r', 'R', [])], [], false);
    const D = window.__mk.D(); D.house.rooms[0].services = { pin: true };   // shuffle off
    window.render();
    const roomEl = document.querySelector('.room[data-room="r"]');
    const dt = new DataTransfer(); dt.setData('svc', 'shuffle');
    roomEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    roomEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return !!window.__mk.D().house.rooms[0].services.shuffle;
  });
  expect(enabled).toBe(true);
});
