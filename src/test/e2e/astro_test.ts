/**
 * `examples/astro` on Astro's dev server: Lit components rendered by the
 * integration's renderer and hydrated in the page, as plain tags and as
 * islands; edits hot-patched in and outside islands; the page runtime added
 * to Astro's HTML; and the Lit panel in Astro's dev toolbar, behind
 * devframe's one-time code.
 */

import {getTempAuthCode} from 'devframe/node/auth';
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

/** The page as a browser asks for it, so the page runtime goes in. */
const pageHtml = async () =>
  (await fetch(`${fixture.origin}/`, {headers: {accept: 'text/html'}})).text();

const shadow = (selector: string, inner: string, page = fixture.page) =>
  page.evaluate(
    `[...(document.querySelector(${JSON.stringify(selector)})?.shadowRoot?.querySelectorAll(${JSON.stringify(inner)}) ?? [])].map((n) => n.textContent.trim())`
  ) as Promise<string[]>;

const deferred = (selector: string) =>
  fixture.page.evaluate(
    `document.querySelector(${JSON.stringify(selector)})?.hasAttribute('defer-hydration')`
  ) as Promise<boolean>;

/** Set by `<ssr-counter>` once its hydration has run. */
const hydrated = (page: Page) => () =>
  page.evaluate(
    `document.querySelector('ssr-counter')?.hasAttribute('hydrated') ?? false`
  ) as Promise<boolean>;

/** Loads the page, collecting its errors, until the counter hydrates. */
const open = async (page = fixture.page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${fixture.origin}/`);
  await expect.poll(hydrated(page)).toBe(true);
  return errors;
};

test('the server renders into declarative shadow roots, and the page runtime goes in', async () => {
  const html = await pageHtml();
  expect(html).toMatch(
    /<ssr-counter start="3"[^>]*><template shadowrootmode="open">/
  );
  // A plain tag carries its array; an island leaves it to Astro's props.
  expect(html).toMatch(
    /<tag-list defer-hydration data-lit-props="\{&quot;tags&quot;:\[&quot;lit&quot;,&quot;astro&quot;\]\}" id="plain"/
  );
  expect(html).toMatch(
    /<astro-island [^>]*client="visible"[^>]*><tag-list defer-hydration data-lit-props="" id="island">/
  );
  // The plugin's `transformIndexHtml` tags, which Astro never asks for.
  const head = html.slice(0, html.indexOf('</head>'));
  expect(head).toMatch(/<script type="module" src="[^"]*\/lib\/runtime\//);
});

test('a component hydrates in place, without a second render', async () => {
  const errors = await open();
  // A client render over the server's DOM would leave two buttons.
  expect(await shadow('ssr-counter', 'button')).toEqual(['Count: 3']);
  await fixture.page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow('ssr-counter', 'button'))
    .toEqual(['Count: 4']);
  expect(errors).toEqual([]);
});

test('a plain tag hydrates with the properties its HTML carried', async () => {
  await open();
  await expect.poll(() => deferred('#plain')).toBe(false);
  expect(await shadow('#plain', 'li')).toEqual(['lit', 'astro']);
  await fixture.page.locator('#plain #add').click();
  await expect
    .poll(() => shadow('#plain', 'li'))
    .toEqual(['lit', 'astro', '#3']);
});

test('a client:visible island hydrates once it scrolls into view', async () => {
  const {page} = fixture;
  await page.setViewportSize({width: 800, height: 300});
  try {
    await open();
    expect(await deferred('#island')).toBe(true);
    await page.locator('#island').scrollIntoViewIfNeeded();
    await expect.poll(() => deferred('#island')).toBe(false);
    expect(await shadow('#island', 'li')).toEqual(['island', 'visible']);
    await page.locator('#island #add').click();
    await expect
      .poll(() => shadow('#island', 'li'))
      .toEqual(['island', 'visible', '#3']);
  } finally {
    await page.setViewportSize({width: 1280, height: 720});
  }
});

test('a client:only island renders in the browser, its named slot assigned', async () => {
  await open();
  await expect.poll(() => shadow('#only', 'li')).toEqual(['client', 'only']);
  expect(
    await fixture.page.evaluate(
      `document.querySelector('#only > h2').assignedSlot?.name`
    )
  ).toBe('title');
});

test('an edit patches components in place, in and outside islands, keeping state', async () => {
  const {page} = fixture;
  const errors = await open();
  await page.locator('ssr-counter #increment').click();
  await page.locator('#island').scrollIntoViewIfNeeded();
  await expect.poll(() => deferred('#island')).toBe(false);
  await page.locator('#island #add').click();
  await expect
    .poll(() => shadow('#island', 'li'))
    .toEqual(['island', 'visible', '#3']);
  await page.evaluate(
    `window.__kept = [document.querySelector('ssr-counter'), document.querySelector('#island')]`
  );

  await fixture.edit('src/components/ssr-counter.ts', (code) =>
    code.replace('<h2>Counter</h2>', '<h2>Tally</h2>')
  );
  await fixture.edit('src/components/tag-list.ts', (code) =>
    code.replace('Add a tag', 'Add one more')
  );
  await expect
    .poll(() => shadow('ssr-counter', 'h2'), {timeout: 10_000})
    .toEqual(['Tally']);
  await expect
    .poll(() => shadow('#island', 'button'), {timeout: 10_000})
    .toEqual(['Add one more']);
  expect(await shadow('ssr-counter', 'button')).toEqual(['Count: 4']);
  expect(await shadow('#island', 'li')).toEqual(['island', 'visible', '#3']);
  expect(
    await page.evaluate(
      `window.__kept[0] === document.querySelector('ssr-counter') && window.__kept[1] === document.querySelector('#island')`
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

const PANEL_FRAME = 'iframe[title="Lit DevTools"]';

/** Whether the panel in the toolbar's frame lists `<ssr-counter>`. */
const panelListsCounter = (page: Page) => () =>
  page
    .frameLocator(PANEL_FRAME)
    .locator('components-view .row')
    .filter({hasText: '<ssr-counter>'})
    .count();

/** A page in a context of its own, which holds no devframe token yet. */
const freshPage = async () => (await fixture.browser.newContext()).newPage();

test('the toolbar app asks for the code, then its panel lists the components', async () => {
  const page = await freshPage();
  try {
    await open(page);
    await page.locator('#dev-bar [data-app-id="lit-devtools"]').click();
    const form = page.locator(
      'astro-dev-toolbar-app-canvas[data-app-id="lit-devtools"] form'
    );
    await expect.poll(() => form.isVisible()).toBe(true);
    await form.locator('input').fill(getTempAuthCode());
    await form.locator('astro-dev-toolbar-button').click();
    await expect.poll(() => form.isVisible()).toBe(false);
    await expect
      .poll(panelListsCounter(page), {timeout: 15_000})
      .toBeGreaterThan(0);
  } finally {
    await page.context().close();
  }
});

test("devframe's link with the code opens the toolbar app, connected", async () => {
  const page = await freshPage();
  try {
    await page.goto(`${fixture.origin}/#devframe_otp=${getTempAuthCode()}`);
    await expect
      .poll(panelListsCounter(page), {timeout: 15_000})
      .toBeGreaterThan(0);
    // Taken out of the address, so a reload doesn't reuse it.
    expect(new URL(page.url()).hash).toBe('');
  } finally {
    await page.context().close();
  }
});
