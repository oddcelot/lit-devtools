/**
 * The demo site in `examples/astro`, page by page, on the dev server: each
 * page loads without errors and does what it says it shows.
 */

import type {Page} from 'playwright-core';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture();
});

afterAll(async () => {
  await fixture?.close();
});

/** Loads a page of the site, collecting its errors. */
const visit = async (path: string, page: Page = fixture.page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${fixture.origin}${path}`);
  return errors;
};

/** The text of the first match of `inner` in the shadow root of `host`. */
const shadowText = (host: string, inner: string, page = fixture.page) =>
  page.evaluate(
    `document.querySelector(${JSON.stringify(host)})?.shadowRoot?.querySelector(${JSON.stringify(inner)})?.textContent.trim() ?? null`
  ) as Promise<string | null>;

test('the home page lists every page, and each loads without errors', async () => {
  const errors = await visit('/');
  const links = (await fixture.page
    .locator('.tour a')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')))) as string[];
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) {
    const response = await fixture.page.goto(`${fixture.origin}${href}`);
    expect(response?.status(), href).toBe(200);
  }
  expect(errors).toEqual([]);
});

test('each island hydrates when its directive says', async () => {
  const {page} = fixture;
  await page.setViewportSize({width: 1280, height: 720});
  try {
    const errors = await visit('/islands/');
    const badge = (id: string) => shadowText(`#${id}`, '.badge');
    for (const id of ['plain', 'load', 'idle']) {
      await expect.poll(() => badge(id)).toMatch(/^Hydrated \d+ ms/);
    }
    await expect
      .poll(() => badge('only'))
      .toMatch(/^Rendered in the browser \d+ ms/);
    // Wide and far below the fold: both still the server's HTML.
    await page.waitForTimeout(500);
    expect(await badge('media')).toBe('Server HTML, not hydrated yet');
    expect(await badge('visible')).toBe('Server HTML, not hydrated yet');

    await page.setViewportSize({width: 700, height: 720});
    await expect.poll(() => badge('media')).toMatch(/^Hydrated/);
    await page.locator('#visible').scrollIntoViewIfNeeded();
    await expect.poll(() => badge('visible')).toMatch(/^Hydrated/);
    expect(errors).toEqual([]);
  } finally {
    await page.setViewportSize({width: 1280, height: 720});
  }
});
