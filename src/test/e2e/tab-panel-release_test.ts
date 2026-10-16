/**
 * A panel in its own tab reaches the page only over RPC, so the page never
 * hears it close the way it hears an in-page panel leave. Closing the tab
 * must still take down what the panel put on the page.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type Fixture, type PanelHandle, startFixture} from './utils.js';

let fixture: Fixture;
let panel: PanelHandle;

beforeAll(async () => {
  fixture = await startFixture({panel: true, plugin: {timeline: true}});
  panel = await fixture.openPanel();
});

afterAll(async () => {
  await fixture?.close();
});

const overlayShown = () =>
  fixture.page.evaluate(
    () => document.querySelector('[data-lit-devtools-anatomy]') !== null
  );

test('closing a tab panel clears the anatomy overlay it drew', async () => {
  const {page} = panel;
  await page.evaluate(() =>
    localStorage.setItem('lit-devtools-components-anatomy', 'true')
  );
  await page.goto(`${fixture.origin}/__lit/#tab=components`);
  await page.reload();
  const row = page
    .locator('components-view .row')
    .filter({hasText: /^\s*<hmr-slots>\s*$/});
  await row.first().click();
  await expect.poll(overlayShown, {timeout: 10_000}).toBe(true);

  await page.close({runBeforeUnload: true});
  await expect.poll(overlayShown, {timeout: 10_000}).toBe(false);
});
