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

test('props keep their types on a plain tag and on an island', async () => {
  const errors = await visit('/props/');
  /** The type column, rendered again from the element's own values. */
  const types = (id: string) =>
    fixture.page.evaluate(
      `(async () => {
        const el = document.getElementById(${JSON.stringify(id)});
        if (el.hasAttribute('defer-hydration')) return null;
        el.requestUpdate();
        await el.updateComplete;
        return [...el.shadowRoot.querySelectorAll('td:nth-child(2)')].map((td) => td.textContent);
      })()`
    );
  const expected = [
    'string',
    'number',
    'boolean',
    'Date',
    'Map',
    'Set',
    'URL',
    'BigInt',
    'RegExp',
    'Object',
    'number',
  ];
  await expect.poll(() => types('plain')).toEqual(expected);
  await expect.poll(() => types('island')).toEqual(expected);
  expect(await shadowText('#plain', 'tr:nth-child(11) td:nth-child(3)')).toBe(
    '{dates: [Date(2026-01-01T00:00:00.000Z)]}'
  );
  expect(errors).toEqual([]);
});

test('slots fill the same way on a plain tag and in islands', async () => {
  const errors = await visit('/slots/');
  /** What each named slot of a card shows, text only. */
  const filled = (id: string) =>
    fixture.page.evaluate(
      `(() => {
        const card = document.getElementById(${JSON.stringify(id)});
        if (!card?.shadowRoot) return null;
        const text = (slot) => slot.assignedNodes().map((n) => n.textContent.trim()).filter(Boolean);
        return Object.fromEntries([...card.shadowRoot.querySelectorAll('slot')].map((s) => [s.name || 'default', text(s)]));
      })()`
    );
  await expect
    .poll(() => filled('plain'))
    .toEqual({
      title: ['Plain tag'],
      meta: ['as written'],
      default: ['The default slot takes the rest, as written.'],
    });
  await expect
    .poll(() => filled('load'))
    .toEqual({
      title: ['client:load'],
      meta: ['hydrated'],
      default: ['Server-rendered, slots and all.'],
    });
  await expect
    .poll(() => filled('only'))
    .toEqual({
      title: ['client:only'],
      meta: ['browser only'],
      default: ["Built in the browser from Astro's slot templates."],
    });
  expect(errors).toEqual([]);
});

test('nested items hydrate inside their list and report to it', async () => {
  const {page} = fixture;
  const errors = await visit('/nested/');
  const items = (id: string) =>
    page.evaluate(
      `[...document.getElementById(${JSON.stringify(id)}).shadowRoot.querySelectorAll('task-item')].map((i) => ({label: i.label, deferred: i.hasAttribute('defer-hydration'), checked: i.shadowRoot.querySelector('input').checked}))`
    );
  const unticked = [
    'Render on the server',
    'Hydrate the list',
    'Hydrate each item',
  ].map((label) => ({label, deferred: false, checked: false}));
  await expect.poll(() => items('plain')).toEqual(unticked);
  await page.locator('#plain task-item').first().locator('input').check();
  await expect.poll(() => shadowText('#plain', '#done')).toBe('1 of 3 done');
  // Below the fold until scrolled to: still unticked in the server's HTML.
  expect(
    await page.evaluate(
      `[...document.getElementById('island').shadowRoot.querySelectorAll('input')].some((i) => i.checked)`
    )
  ).toBe(false);
  await page.locator('#island').scrollIntoViewIfNeeded();
  await expect.poll(() => items('island')).toEqual(unticked);
  expect(errors).toEqual([]);
});

test('a page swapped in by a view transition hydrates its server HTML', async () => {
  const {page} = fixture;
  const errors = await visit('/islands/');
  await page.locator('nav a[href="/transitions/"]').click();
  await page.waitForURL(`${fixture.origin}/transitions/`);
  const badge = (id: string) => shadowText(id, '.badge');
  await expect
    .poll(() => badge('#arrival'))
    .toBe('This page was swapped in by a view transition');
  await expect.poll(() => badge('#plain')).toMatch(/^Hydrated/);
  await expect.poll(() => badge('#island')).toMatch(/^Hydrated/);
  await expect
    .poll(() =>
      page.evaluate(
        `[...document.querySelector('#tags').shadowRoot.querySelectorAll('li')].map((li) => li.textContent)`
      )
    )
    .toEqual(['swapped', 'still', 'hydrated']);
  // Persisted across the swap, so it counted it; a reload starts over.
  expect(await shadowText('visit-counter', 'strong')).toBe('2');
  await page.reload();
  await expect.poll(() => shadowText('visit-counter', 'strong')).toBe('1');
  await expect
    .poll(() => badge('#arrival'))
    .toBe('This page came from a full load');
  expect(errors).toEqual([]);
});

test('the DevTools page: an edit keeps the element and its state', async () => {
  const {page} = fixture;
  const errors = await visit('/devtools/');
  const clock = () => shadowText('#clock', 'time');
  const first = await clock();
  await expect.poll(clock, {timeout: 3000}).not.toBe(first);

  await expect
    .poll(() => shadowText('#edit', 'button'))
    .toBe('Clicked 0 times');
  await page.locator('#edit button').click();
  await page.locator('#edit button').click();
  await page.evaluate(`window.__edit = document.querySelector('#edit')`);
  await fixture.edit('src/components/edit-me.ts', (code) =>
    code.replace('<h3>Edit me</h3>', '<h3>Edited</h3>')
  );
  await expect
    .poll(() => shadowText('#edit', 'h3'), {timeout: 10_000})
    .toBe('Edited');
  expect(await shadowText('#edit', 'button')).toBe('Clicked 2 times');
  expect(
    await page.evaluate(`window.__edit === document.querySelector('#edit')`)
  ).toBe(true);
  expect(errors).toEqual([]);
});
