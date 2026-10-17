/**
 * The SSR example with `one-port.mjs`, as `stackblitz.mjs` starts it. StackBlitz
 * gives each port its own origin, so Vite's HMR socket and the DevTools
 * dock's have to come from the page's port rather than one of their own.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type SsrFixture, startSsrFixture} from './ssr-utils.js';

let fixture: SsrFixture;
const sockets: string[] = [];

beforeAll(async () => {
  fixture = await startSsrFixture(
    {timeline: true},
    {devtools: {enabled: true, clientAuth: false}},
    {onePort: true}
  );
});

afterAll(async () => {
  await fixture?.close();
});

test("HMR and the dock connect on the page's own port", async () => {
  const {page} = fixture;
  page.on('websocket', (ws) => sockets.push(new URL(ws.url()).host));
  await page.reload();
  await expect
    .poll(
      () =>
        page.evaluate(
          `[...document.querySelectorAll('*')].some((e) => e.localName.startsWith('devframes-'))`
        ),
      {timeout: 10_000}
    )
    .toBe(true);
  await expect.poll(() => sockets.length).toBeGreaterThanOrEqual(2);
  const {host} = new URL(fixture.origin);
  expect(sockets.every((s) => s === host)).toBe(true);

  await fixture.edit('src/ssr-counter.ts', (code) =>
    code.replace('>Hydrated<', '>Hydrated, then edited<')
  );
  await expect
    .poll(() =>
      page.evaluate(
        `document.querySelector('ssr-counter').shadowRoot.textContent`
      )
    )
    .toContain('Hydrated, then edited');
});
