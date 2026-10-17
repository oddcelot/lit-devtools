/**
 * `examples/astro` with the Vite DevTools hub on. The hub mounts the Lit
 * panel at the same `/__lit/` the plugin serves without it, so the toolbar
 * window loads it either way. Astro pages never get the hub's dock (Astro
 * runs no `transformIndexHtml` but the plugin's own), so the toolbar is the
 * way in.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    // `clientAuth: false`: the code path has its own tests in astro_test.
    vite: {devtools: {enabled: true, clientAuth: false}},
  });
});

afterAll(async () => {
  await fixture?.close();
});

test('the toolbar window shows the panel the hub mounts', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const meta = await fetch(`${fixture.origin}/__lit/__connection.json`);
  // The hub's socket, not one of the plugin's own.
  expect(await meta.json()).toMatchObject({
    websocket: {path: '../__devtools/__ws'},
  });

  await page.goto(`${fixture.origin}/basics/`);
  await page.locator('#dev-bar [data-app-id="lit-devtools"]').click();
  await expect
    .poll(
      () =>
        page
          .frameLocator('iframe[title="Lit DevTools"]')
          .locator('components-view .row')
          .filter({hasText: '<ssr-counter>'})
          .count(),
      {timeout: 15_000}
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
