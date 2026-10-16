/**
 * A page the server renders with `@lit-labs/ssr` and the browser hydrates,
 * under the plugin (`examples/ssr`). The baseline the SSR work builds on:
 * the HTML arrives with declarative shadow roots, components hydrate in
 * place rather than rendering a second copy, and `defer-hydration` holds an
 * element back until it is removed.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type SsrFixture, startSsrFixture} from './ssr-utils.js';

let fixture: SsrFixture;

beforeAll(async () => {
  fixture = await startSsrFixture();
});

afterAll(async () => {
  await fixture?.close();
});

const shadow = (selector: string, inner: string) =>
  fixture.page.evaluate(
    `[...(document.querySelector(${JSON.stringify(selector)})?.shadowRoot?.querySelectorAll(${JSON.stringify(inner)}) ?? [])].map((n) => n.textContent.trim())`
  ) as Promise<string[]>;

test('the server sends the components rendered, in declarative shadow roots', async () => {
  const html = await (await fetch(`${fixture.origin}/`)).text();
  expect(html).toMatch(
    /<ssr-counter\s+start="3"><template shadowroot(mode)?="open"/
  );
  expect(html).toContain('Count: <!--lit-part-->3<!--/lit-part-->');
  expect(html).toContain('<ssr-deferred  defer-hydration>');
});

test('a component hydrates in place, without a second render', async () => {
  const {page} = fixture;
  await page.goto(`${fixture.origin}/`);
  await expect.poll(() => shadow('ssr-counter', '#side')).toEqual(['Hydrated']);
  // A client render over the server's DOM would leave two buttons.
  expect(await shadow('ssr-counter', 'button')).toEqual(['Count: 3']);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow('ssr-counter', 'button'))
    .toEqual(['Count: 4']);
});

test('defer-hydration holds an element back until it is removed', async () => {
  const {page} = fixture;
  await page.goto(`${fixture.origin}/`);
  await expect.poll(() => shadow('ssr-counter', '#side')).toEqual(['Hydrated']);
  await page.locator('ssr-deferred #poke').click();
  expect(await shadow('ssr-deferred', 'button')).toEqual(['Clicks: 0']);

  await page.locator('#wake').click();
  await page.locator('ssr-deferred #poke').click();
  await expect
    .poll(() => shadow('ssr-deferred', 'button'))
    .toEqual(['Clicks: 1']);
});

test('an edit patches a hydrated component in place, keeping its state', async () => {
  const {page} = fixture;
  await page.goto(`${fixture.origin}/`);
  await expect.poll(() => shadow('ssr-counter', '#side')).toEqual(['Hydrated']);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow('ssr-counter', 'button'))
    .toEqual(['Count: 4']);
  await page.evaluate(`window.__kept = document.querySelector('ssr-counter')`);

  await fixture.edit('src/ssr-counter.ts', (code) =>
    code.replace('<h2>Counter</h2>', '<h2>Tally</h2>')
  );
  await expect
    .poll(() => shadow('ssr-counter', 'h2'), {timeout: 10_000})
    .toEqual(['Tally']);
  expect(await shadow('ssr-counter', 'button')).toEqual(['Count: 4']);
  expect(
    await page.evaluate(
      `window.__kept === document.querySelector('ssr-counter')`
    )
  ).toBe(true);
});

test('after an edit, the next server render uses the new code', async () => {
  await fixture.edit('src/ssr-counter.ts', (code) =>
    code.replace(/<h2>\w+<\/h2>/, '<h2>Edited on the server</h2>')
  );
  await expect
    .poll(
      async () => {
        const res = await fetch(`${fixture.origin}/`);
        return (await res.text()).includes('<h2>Edited on the server</h2>');
      },
      {timeout: 10_000}
    )
    .toBe(true);
  // And the open page has it too, so the next load gets the new client code.
  await expect
    .poll(() => shadow('ssr-counter', 'h2'), {timeout: 10_000})
    .toEqual(['Edited on the server']);
});
