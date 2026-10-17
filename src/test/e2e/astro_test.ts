/**
 * `examples/astro` on Astro's dev server: Lit components rendered by the
 * integration's renderer and hydrated in the page, as plain tags and as
 * islands; edits hot-patched in and outside islands; the page runtime added
 * to Astro's HTML; and the Lit panel in Astro's dev toolbar, behind
 * devframe's one-time code, typed in or opened from the printed link.
 */

import {getTempAuthCode} from 'devframe/node/auth';
import type {Page} from 'playwright-core';
import {afterAll, beforeAll, expect, test, vi} from 'vite-plus/test';
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
  (
    await fetch(`${fixture.origin}/basics/`, {headers: {accept: 'text/html'}})
  ).text();

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
  await page.goto(`${fixture.origin}/basics/`);
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

test('after an edit, the next page load is rendered with the new code', async () => {
  const {page} = fixture;
  await open();
  await fixture.edit('src/components/ssr-counter.ts', (code) =>
    code.replace(/<h2>\w+<\/h2>/, '<h2>Edited on the server</h2>')
  );
  // The open page takes the patch first, so the reload below finds the
  // new client code in place.
  await expect
    .poll(() => shadow('ssr-counter', 'h2'), {timeout: 10_000})
    .toEqual(['Edited on the server']);
  // No restart: the renderer's registry takes the new definition.
  await expect
    .poll(async () =>
      (await pageHtml()).includes('<h2>Edited on the server</h2>')
    )
    .toBe(true);

  // Server and client agree, so it hydrates without a mismatch.
  const errors = await open();
  expect(await shadow('ssr-counter', 'h2')).toEqual(['Edited on the server']);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow('ssr-counter', 'button'))
    .toEqual(['Count: 4']);
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

test('the link printed with the code opens the panel, connected', async () => {
  // What devframe prints, through either door.
  const printed: string[] = [];
  const write = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      printed.push(String(chunk));
      return true;
    });
  const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
    printed.push(args.join(' '));
  });
  const link = () =>
    /https?:\/\/\S+#devframe_otp=\w+/.exec(printed.join(''))?.[0];
  // A page for the panel to follow.
  await open();
  const asker = await freshPage();
  const page = await freshPage();
  try {
    // A panel with no token asks for a code, which prints it with the link.
    await asker.goto(`${fixture.origin}/__lit/`);
    await expect.poll(link, {timeout: 10_000}).toBeDefined();
    const url = new URL(link()!);
    expect(url.pathname).toBe('/__lit/');

    await page.goto(`${fixture.origin}${url.pathname}${url.hash}`);
    await expect
      .poll(
        () =>
          page
            .locator('components-view .row')
            .filter({hasText: '<ssr-counter>'})
            .count(),
        {timeout: 15_000}
      )
      .toBeGreaterThan(0);

    // The token it got serves the toolbar window too.
    await open(page);
    await page.locator('#dev-bar [data-app-id="lit-devtools"]').click();
    await expect
      .poll(panelListsCounter(page), {timeout: 15_000})
      .toBeGreaterThan(0);
    expect(
      await page
        .locator(
          'astro-dev-toolbar-app-canvas[data-app-id="lit-devtools"] form'
        )
        .isVisible()
    ).toBe(false);
  } finally {
    write.mockRestore();
    log.mockRestore();
    await asker.context().close();
    await page.context().close();
  }
});

test('the Timeline records the updates of an Astro page', async () => {
  const panel = await freshPage();
  try {
    await panel.goto(
      `${fixture.origin}/__lit/#tab=timeline&devframe_otp=${getTempAuthCode()}`
    );
    await panel.waitForSelector('timeline-view');
    // The list reads simpler than the tracks the Timeline opens in.
    await panel.evaluate(() =>
      localStorage.setItem('lit-devtools-timeline-mode', 'list')
    );
    await panel.reload();
    await panel.waitForSelector('timeline-event-list');
    await open();
    await panel.getByRole('button', {name: /Record/}).click();
    await fixture.page.locator('ssr-counter #increment').click();
    await expect
      .poll(
        () =>
          panel
            .locator('timeline-event-list .row')
            .filter({hasText: 'ssr-counter'})
            .count(),
        {timeout: 15_000}
      )
      .toBeGreaterThan(0);
  } finally {
    await panel.context().close();
  }
});
