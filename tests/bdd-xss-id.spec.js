import { test, expect } from '@playwright/test';

// Regression: a notebook imported (or opened as a shared .html) may carry attacker-authored
// element ids. Those ids are interpolated into data-* attributes at render time, so an id like
//   a"><img src=x onerror=...>
// must never break out of its attribute and execute. The migration layer normalizes ids on every
// load/import/seed path. This pins that the import path neutralizes the vector.
test('imported notebook with a script-payload id cannot inject markup or run JS', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.LS && !!window.importHouse);

  const PAYLOAD = 'a"><img src=x onerror=window.__XSS=1>';
  const result = await page.evaluate((payload) => {
    window.__XSS = undefined;
    const house = {
      name: 'pwn',
      rooms: [{
        id: payload, name: 'R',
        cards: [{
          id: payload, name: 'c',
          slots: [{ id: payload, type: 'text', props: { text: 'hi' } }],
        }],
      }],
    };
    window.importHouse(JSON.stringify(house));
    return {
      injectedImg: !!document.querySelector('img[onerror], img[src="x"]'),
      stageHasInjection: (document.querySelector('#stage')?.innerHTML || '').includes('<img'),
      // every rendered id-bearing attribute must be free of the breakout chars
      brokenOut: [...document.querySelectorAll('[data-sid],[data-fid],[data-id],[data-room]')]
        .some((el) => /["<>]/.test(el.getAttribute('data-sid') || '')
          || /["<>]/.test(el.getAttribute('data-fid') || '')
          || /["<>]/.test(el.getAttribute('data-id') || '')
          || /["<>]/.test(el.getAttribute('data-room') || '')),
      rendered: (document.querySelector('#stage')?.childElementCount ?? 0) > 0,
    };
  }, PAYLOAD);

  // Give any async onerror a chance to fire before we assert it didn't.
  await page.waitForTimeout(300);
  const xssFired = await page.evaluate(() => window.__XSS === 1);

  expect(xssFired, 'onerror payload executed — XSS').toBe(false);
  expect(result.injectedImg, 'attacker <img> reached the DOM').toBe(false);
  expect(result.stageHasInjection, 'raw <img> present in stage markup').toBe(false);
  expect(result.brokenOut, 'an id with breakout chars survived into a data-* attribute').toBe(false);
  expect(result.rendered, 'import should still render the (sanitized) notebook').toBe(true);
});

// A shared .html / persisted DB carries `stores`, whose ids are interpolated into data-* in the
// store panel. They ride a different path than house content (rebuildRefs on load/seed-boot, not
// importHouse), so pin that path too: persist a payload store id, reload to run load()→rebuildRefs,
// then render the store panel in Edit mode.
test('a payload store id is neutralized on load and cannot inject markup', async ({ page }) => {
  const PAYLOAD = 'a"><img src=x onerror=window.__XSS=1>';
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.LS);

  await page.evaluate((payload) => {
    const D = window.LS.DB();
    (D.stores = D.stores || []).push({ id: payload, name: 'X', icon: '' });
    localStorage.setItem('lsa_db_v13', JSON.stringify(D));
  }, PAYLOAD);

  await page.reload();
  await page.waitForFunction(() => !!window.LS && !!window.render);

  const res = await page.evaluate(() => {
    const D = window.LS.DB();
    D.place = 'house'; D.studyOn = false; window.render();
    return {
      storeIdsSafe: (D.stores || []).every((s) => !/["<>]/.test(s.id)),
      injectedImg: !!document.querySelector('img[onerror], img[src="x"]'),
      brokenOut: [...document.querySelectorAll('[data-s]')].some((el) => /["<>]/.test(el.getAttribute('data-s') || '')),
    };
  });

  await page.waitForTimeout(300);
  const xssFired = await page.evaluate(() => window.__XSS === 1);

  expect(xssFired, 'store-id onerror payload executed — XSS').toBe(false);
  expect(res.injectedImg, 'attacker <img> reached the DOM via store id').toBe(false);
  expect(res.brokenOut, 'a store id with breakout chars survived into data-s').toBe(false);
  expect(res.storeIdsSafe, 'store ids should be normalized on load').toBe(true);
});

// Templates are house-shaped and instantiated (New notebook → pick template → Create) by cloning their
// cards into a live notebook. A hand-edited persisted DB could carry a template with a payload slot id;
// rebuildRefs must normalize templates too, so the cloned cards never render a breakout id.
test('a payload template slot id is neutralized on load', async ({ page }) => {
  const PAYLOAD = 'a"><img src=x onerror=window.__XSS=1>';
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.LS);

  await page.evaluate((payload) => {
    const D = window.LS.DB();
    D.templates = [{
      id: 'tpl1', name: 'T',
      rooms: [{ id: 'tr1', name: 'R', cards: [{ id: 'tc1', name: 'c', slots: [{ id: payload, type: 'text', props: { text: 'hi' } }] }] }],
    }];
    localStorage.setItem('lsa_db_v13', JSON.stringify(D));
  }, PAYLOAD);

  await page.reload();
  await page.waitForFunction(() => !!window.LS);

  const res = await page.evaluate(() => {
    const D = window.LS.DB();
    const ids = [];
    (D.templates || []).forEach((t) => (t.rooms || []).forEach((r) => (r.cards || []).forEach((c) =>
      (c.slots || []).concat(c.back || []).forEach((s) => s && ids.push(s.id)))));
    return { templateSlotIdsSafe: ids.every((id) => !/["<>]/.test(id)), injectedImg: !!document.querySelector('img[onerror], img[src="x"]') };
  });

  await page.waitForTimeout(300);
  const xssFired = await page.evaluate(() => window.__XSS === 1);

  expect(xssFired, 'template-slot-id payload executed — XSS').toBe(false);
  expect(res.injectedImg, 'attacker <img> reached the DOM via a template').toBe(false);
  expect(res.templateSlotIdsSafe, 'template slot ids should be normalized on load').toBe(true);
});
