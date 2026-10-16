/**
 * With `timeline` on and no Vite DevTools hub, the plugin serves the panel on
 * Vite's own server at `/__lit/`. The hub's own path is covered by every
 * other panel e2e.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type Fixture, startFixture} from './utils.js';

let fixture: Fixture;

beforeAll(async () => {
  fixture = await startFixture({panel: 'no-hub', plugin: {timeline: true}});
});

afterAll(async () => {
  await fixture?.close();
});

test('serves the panel without the hub, and it reaches the page', async () => {
  const meta = await fetch(`${fixture.origin}/__lit/__connection.json`);
  expect(await meta.json()).toMatchObject({backend: 'websocket'});
  // Vite DevTools is not there to answer its own path: Vite's HTML fallback
  // does.
  const hub = await fetch(`${fixture.origin}/__devtools/__connection.json`);
  expect(hub.headers.get('content-type')).toContain('text/html');

  const {page, errors} = await fixture.openPanel();
  await page.goto(`${fixture.origin}/__lit/#tab=components`);
  await expect
    .poll(
      () =>
        page
          .locator('components-view .row')
          .filter({hasText: /^\s*<hmr-counter>\s*$/})
          .count(),
      {timeout: 15_000}
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
