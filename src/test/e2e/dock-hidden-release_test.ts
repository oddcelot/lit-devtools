/**
 * The DevTools dock keeps a collapsed dock's iframe alive, out of sight, so
 * the panel neither unloads nor disconnects. What it drew on the page has to
 * go when it is hidden, and come back when it is shown again.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type Fixture, startFixture} from './utils.js';

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

const setPaneShown = (shown: boolean) =>
  fixture.page.evaluate((shown) => {
    document.getElementById('pane')!.style.display = shown ? '' : 'none';
  }, shown);

test('hiding the panel takes its anatomy overlay down, showing it brings it back', async () => {
  const {page, origin} = fixture;
  await page.evaluate((origin) => {
    localStorage.setItem('lit-devtools-components-anatomy', 'true');
    // Docked as the hub docks it: a frame on the app page, hidden by an
    // ancestor rather than unloaded.
    const pane = document.createElement('div');
    pane.id = 'pane';
    pane.style.cssText =
      'position: fixed; inset: auto 0 0 0; height: 50vh; z-index: 1;';
    const frame = document.createElement('iframe');
    frame.src = `${origin}/__lit/#tab=components`;
    frame.style.cssText = 'width: 100%; height: 100%; border: 0;';
    pane.append(frame);
    document.body.append(pane);
  }, origin);

  const panel = page.frameLocator('#pane iframe');
  await panel
    .locator('components-view .row')
    .filter({hasText: /^\s*<hmr-slots>\s*$/})
    .first()
    .click();
  await expect.poll(overlayShown, {timeout: 10_000}).toBe(true);

  await setPaneShown(false);
  await expect.poll(overlayShown, {timeout: 10_000}).toBe(false);

  await setPaneShown(true);
  await expect.poll(overlayShown, {timeout: 10_000}).toBe(true);
});
