import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('A1: products carry store (one name); legacy shop/shops fields migrate', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const fields = D.products.map(p => ({ hasStore: 'store' in p, hasShop: 'shop' in p }));
    // legacy save shapes migrate
    D.products.push({ id: 'pl1', name: 'OldShop', slots: [{ id: 's', type: 'text', props: { text: 'x' }, verbs: {} }], container: {}, rules: {}, accent: '', shop: 'core' });
    D.products.push({ id: 'pl2', name: 'OlderShops', slots: [{ id: 's', type: 'text', props: { text: 'x' }, verbs: {} }], container: {}, rules: {}, accent: '', shops: ['fun'] });
    window.rebuildRefs();
    const m1 = D.products.find(p => p.id === 'pl1'), m2 = D.products.find(p => p.id === 'pl2');
    return { allStore: fields.every(f => f.hasStore && !f.hasShop),
             m1: { store: m1.store, shopGone: !('shop' in m1) },
             m2: { store: m2.store, shopsGone: !('shops' in m2) } };
  });
  expect(out.allStore).toBe(true);
  expect(out.m1).toEqual({ store: 'core', shopGone: true });
  expect(out.m2).toEqual({ store: 'fun', shopsGone: true });
});
