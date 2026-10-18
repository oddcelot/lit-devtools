/**
 * A panel in its own tab reaches the page only over RPC, so the page never
 * hears it close the way it hears an in-page panel leave. Closing the tab
 * must still take down what the panel put on the page.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type Fixture, type PanelHandle, startFixture} from './utils.js';

let fixture: Fixture;

beforeAll(async () => {
  fixture = await startFixture({panel: true, plugin: {timeline: true}});
});

afterAll(async () => {
  await fixture?.close();
});

const overlayShown = () =>
  fixture.page.evaluate(
    () => document.querySelector('[data-lit-devtools-anatomy]') !== null
  );

/** A tab panel with the overlay drawn for `<hmr-slots>`. */
const drawOverlay = async (): Promise<PanelHandle> => {
  const handle = await fixture.openPanel();
  const {page} = handle;
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
  return handle;
};

test('closing a tab panel clears the anatomy overlay it drew', async () => {
  const {page} = await drawOverlay();
  await page.close({runBeforeUnload: true});
  await expect.poll(overlayShown, {timeout: 10_000}).toBe(false);
});

test('the server releases the page for a tab panel that dies', async () => {
  const {page} = await drawOverlay();
  // The panel's own teardown on `pagehide` is the fast path, and a closing
  // tab can drop its RPCs. A crashed renderer runs no `pagehide` at all, so
  // only the node, seeing the panel's connection go, can clear the overlay.
  const cdp = await page.context().newCDPSession(page);
  // It never answers: the renderer is gone first.
  void cdp.send('Page.crash').catch(() => {});
  await expect.poll(overlayShown, {timeout: 10_000}).toBe(false);
  await page.close().catch(() => {});
});
