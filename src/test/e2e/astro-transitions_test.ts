/**
 * Astro's view transitions (`<ClientRouter />`) swap a page's content
 * without loading the page anew, so nothing that runs once per load runs
 * for the new content. The page script releases deferred elements again on
 * `astro:page-load`; islands hydrate as Astro inserts them; and the
 * plugin's page runtime, loaded with the first page, keeps reporting the
 * components the swap brought in.
 *
 * Astro parses the next page with `DOMParser`, which leaves declarative
 * shadow roots as templates, and attaches them only once the new body is
 * in the page, after each defined element has made a shadow root of its
 * own. The page script attaches them before the swap, so the elements
 * hydrate the server's HTML rather than render it anew.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {
  INSPECT_CMD_CHANNEL,
  INSPECT_DATA_CHANNEL,
  type InspectorMessage,
  type InspectorTreeNode,
} from '../../types/inspector.js';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

const page = (title: string, body: string) => `---
import {ClientRouter} from 'astro:transitions';
import {TagList} from '../components/tag-list.ts';
import '../components/ssr-counter.ts';
import '../components/tag-list.ts';
import '../components/ssr-deferred.ts';
---

<html lang="en">
  <head>
    <title>${title}</title>
    <link rel="icon" href="/favicon.svg" />
    <ClientRouter />
  </head>
  <body>
    ${body}
    <script>
      import '../components/ssr-counter.ts';
      import '../components/tag-list.ts';
      import '../components/ssr-deferred.ts';
    </script>
  </body>
</html>
`;

const FIRST = page(
  'First',
  `<ssr-counter start="1"></ssr-counter>
    <a id="next" href="/second">Second</a>`
);

const SECOND = page(
  'Second',
  `<ssr-counter start="7"></ssr-counter>
    <tag-list id="plain" tags={['after', 'swap']}></tag-list>
    <TagList id="island" client:load tags={['island']} />
    <ssr-deferred defer-hydration></ssr-deferred>
    <a id="back" href="/first">First</a>`
);

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    files: {
      'src/pages/first.astro': FIRST,
      'src/pages/second.astro': SECOND,
    },
  });
});

afterAll(async () => {
  await fixture?.close();
});

const evaluate = <T>(expression: string) =>
  fixture.page.evaluate(expression) as Promise<T>;

const shadow = (selector: string, inner: string) =>
  evaluate<string[]>(
    `[...(document.querySelector(${JSON.stringify(selector)})?.shadowRoot?.querySelectorAll(${JSON.stringify(inner)}) ?? [])].map((n) => n.textContent.trim())`
  );

const hydrated = () =>
  evaluate<boolean>(
    `document.querySelector('ssr-counter')?.hasAttribute('hydrated') ?? false`
  );

test('after a swap, deferred elements are released and islands hydrate', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${fixture.origin}/first`);
  await expect.poll(hydrated).toBe(true);
  await page.evaluate(`window.__sameDocument = true`);

  await page.locator('#next').click();
  await page.waitForURL(`${fixture.origin}/second`);
  await expect.poll(() => shadow('#plain', 'li')).toEqual(['after', 'swap']);
  await expect
    .poll(() =>
      evaluate<boolean>(
        `document.querySelector('#plain').hasAttribute('defer-hydration')`
      )
    )
    .toBe(false);
  // Held back by hand, still showing what the server rendered.
  expect(await shadow('ssr-deferred', 'h2')).toEqual(['Deferred']);
  expect(
    await evaluate<number>(
      `document.querySelectorAll('body template[shadowrootmode]').length`
    )
  ).toBe(0);
  await expect.poll(() => shadow('#island', 'li')).toEqual(['island']);
  await expect.poll(hydrated).toBe(true);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow('ssr-counter', 'button'))
    .toEqual(['Count: 8']);

  await page.locator('#back').click();
  await page.waitForURL(`${fixture.origin}/first`);
  await expect.poll(hydrated).toBe(true);
  expect(await shadow('ssr-counter', 'button')).toEqual(['Count: 1']);

  // Swapped, never loaded: what ran once still holds.
  expect(await evaluate<boolean>(`window.__sameDocument`)).toBe(true);
  expect(errors).toEqual([]);
});

test("the page runtime reports the swapped-in page's components", async () => {
  const {page} = fixture;
  const vite = fixture.vite!;
  let roots: InspectorTreeNode[] = [];
  vite.hot.on(INSPECT_DATA_CHANNEL, (data: InspectorMessage) => {
    if (data.type === 'tree') roots = data.roots;
  });
  const tree = () => {
    vite.hot.send(INSPECT_CMD_CHANNEL, {type: 'tree'});
    return roots
      .filter((n) => n.tagName !== 'astro-island')
      .map((n) => `${n.tagName} ${n.ssr}`)
      .sort();
  };

  await page.goto(`${fixture.origin}/first`);
  await expect.poll(hydrated).toBe(true);
  await expect.poll(tree, {timeout: 10_000}).toEqual(['ssr-counter hydrated']);

  await page.locator('#next').click();
  await page.waitForURL(`${fixture.origin}/second`);
  await expect
    .poll(tree, {timeout: 10_000})
    .toEqual([
      'ssr-counter hydrated',
      'ssr-deferred deferred',
      'tag-list hydrated',
    ]);
});
