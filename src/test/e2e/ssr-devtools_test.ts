/**
 * The DevTools dock on a server-rendered page. Vite runs in middleware mode
 * there, with no HTTP server of its own, so the hub opens a side socket on
 * `server.host`; the example passes its host through so the page can reach
 * it.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type SsrFixture, startSsrFixture} from './ssr-utils.js';

let fixture: SsrFixture;

beforeAll(async () => {
  fixture = await startSsrFixture(
    {timeline: true},
    // `clientAuth: false` as in the playground fixture: nobody answers the
    // terminal prompt in a test run.
    {devtools: {enabled: true, clientAuth: false}}
  );
});

afterAll(async () => {
  await fixture?.close();
});

test('the dock connects, and the Lit panel is served', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${fixture.origin}/`);
  await expect
    .poll(
      () =>
        page.evaluate(
          `[...document.querySelectorAll('*')].some((e) => e.localName.startsWith('devframes-'))`
        ),
      {timeout: 10_000}
    )
    .toBe(true);
  // Long enough for a refused socket to have said so.
  await page.waitForTimeout(1500);
  expect(errors.filter((e) => e.includes('WebSocket'))).toEqual([]);
  const panel = await fetch(`${fixture.origin}/__lit/`);
  expect(panel.status).toBe(200);
});
