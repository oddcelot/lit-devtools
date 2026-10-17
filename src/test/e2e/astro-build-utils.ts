/**
 * Checks shared by the tests of `examples/astro` built, one setup per file:
 * Astro's server-side registry is global, so two builds can't share a
 * process, as they never do outside a test.
 */

import type {Page} from 'playwright-core';
import {expect} from 'vite-plus/test';
import type {AstroFixture} from './astro-utils.js';

export const shadow = (page: Page, selector: string, inner: string) =>
  page.evaluate(
    `[...(document.querySelector(${JSON.stringify(selector)})?.shadowRoot?.querySelectorAll(${JSON.stringify(inner)}) ?? [])].map((n) => n.textContent.trim())`
  ) as Promise<string[]>;

/** Loads the page, collecting its errors but the browser's own favicon. */
export const open = async (fixture: AstroFixture, path = '/basics/') => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const {url} = m.location();
    if (m.type() === 'error' && !url.endsWith('/favicon.ico')) {
      errors.push(`${m.text()} ${url}`);
    }
  });
  await page.goto(`${fixture.origin}${path}`);
  return errors;
};

/** Hydrated once its button counts on from the server's start. */
export const counterHydrates = async (page: Page) => {
  await expect
    .poll(() =>
      page.evaluate(
        `document.querySelector('ssr-counter')?.hasAttribute('hydrated') ?? false`
      )
    )
    .toBe(true);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow(page, 'ssr-counter', 'button'))
    .toEqual(['Count: 4']);
};
