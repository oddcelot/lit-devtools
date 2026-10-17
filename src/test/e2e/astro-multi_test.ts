/**
 * `examples/astro` built, on its page with Preact next to Lit: each
 * renderer hydrates its own islands, `client:only="lit"` resolves to Lit by
 * the renderer's name, and a Lit element inside a Preact island is
 * Preact's to render: a plain tag on the server, which Lit renders once
 * its class is defined in the browser.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {open, shadow} from './astro-build-utils.js';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({build: true});
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

test('both renderers hydrate their islands, and client:only="lit" finds Lit', async () => {
  const {page} = fixture;
  const errors = await open(fixture, '/frameworks/');
  await page.locator('#preact').click();
  await expect
    .poll(() => page.locator('#preact').textContent())
    .toBe('Preact: 1');
  await expect
    .poll(() => shadow(page, '#lit', '.badge'))
    .toEqual([expect.stringMatching(/^Hydrated/)]);
  await expect
    .poll(() => shadow(page, '#lit-only', '.badge'))
    .toEqual([expect.stringMatching(/^Rendered in the browser/)]);
  expect(errors).toEqual([]);
});

test('Lit elements in a Preact island render in the browser, with its props', async () => {
  const html = await (await fetch(`${fixture.origin}/frameworks/`)).text();
  // Plain tags from Preact's renderer: no shadow root from the server.
  expect(html).toMatch(/<ssr-counter start="5"><\/ssr-counter>/);

  const {page} = fixture;
  const errors = await open(fixture, '/frameworks/');
  for (const id of ['#hydrated', '#browser']) {
    const counter = `${id} ssr-counter`;
    await expect
      .poll(() => shadow(page, counter, 'button'))
      .toEqual(['Count: 5']);
    await page.locator(`${counter} #increment`).click();
    await expect
      .poll(() => shadow(page, counter, 'button'))
      .toEqual(['Count: 6']);
  }
  // Rendered by Preact in the browser, the island sets the array at once.
  await expect
    .poll(() => shadow(page, '#browser tag-list', 'li'))
    .toEqual(['from', 'preact']);
  // Hydrated, it sets it when its state next changes: Preact's hydration
  // leaves properties as the server's HTML had them.
  for (const id of ['#hydrated', '#browser']) {
    await page.locator(`${id} .more`).click();
    await expect
      .poll(() => shadow(page, `${id} tag-list`, 'li'))
      .toEqual(['from', 'preact', 'more']);
  }
  expect(errors).toEqual([]);
});
