/**
 * `examples/astro`'s Preact setup built (`astro.multi.config.mjs`): Lit's
 * renderer next to another one, each hydrating its own islands, and
 * `client:only="lit"` resolving to Lit by the renderer's name. A Lit
 * element inside a Preact island is Preact's to render: a plain tag on the
 * server, which Lit renders once its class is defined in the browser.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {counterHydrates, open, shadow} from './astro-build-utils.js';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

/** A Preact island holding Lit elements, one with an array property. */
const LIT_IN_PREACT = `import {useState} from 'preact/hooks';
import '../../src/components/ssr-counter.ts';
import '../../src/components/tag-list.ts';

export default function LitInPreact({id}: {id: string}) {
  const [tags, setTags] = useState(['from', 'preact']);
  return (
    <section id={id}>
      <ssr-counter start={5} />
      <tag-list tags={tags} />
      <button class="more" onClick={() => setTags([...tags, 'more'])}>More</button>
    </section>
  );
}
`;

const PAGE = `---
import LitInPreact from '../components/LitInPreact.tsx';
---

<html lang="en">
  <head>
    <title>Lit in Preact</title>
    <link rel="icon" href="/favicon.svg" />
  </head>
  <body>
    <LitInPreact id="hydrated" client:load />
    <LitInPreact id="only" client:only="preact" />
  </body>
</html>
`;

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    config: 'astro.multi.config.mjs',
    build: true,
    files: {
      'multi/components/LitInPreact.tsx': LIT_IN_PREACT,
      'multi/pages/lit-in-preact.astro': PAGE,
    },
  });
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

test('both renderers hydrate their islands, and client:only="lit" finds Lit', async () => {
  const {page} = fixture;
  const errors = await open(fixture, '/');
  await counterHydrates(page);
  await page.locator('#preact').click();
  await expect
    .poll(() => page.locator('#preact').textContent())
    .toBe('Preact: 1');
  await expect.poll(() => shadow(page, '#island', 'li')).toEqual(['island']);
  await expect.poll(() => shadow(page, '#only', 'li')).toEqual(['only']);
  expect(errors).toEqual([]);
});

test('Lit elements in a Preact island render in the browser, with its props', async () => {
  const html = await (await fetch(`${fixture.origin}/lit-in-preact`)).text();
  // Plain tags from Preact's renderer: no shadow root from the server.
  expect(html).toMatch(/<ssr-counter start="5"><\/ssr-counter>/);
  expect(html).not.toContain('shadowrootmode');

  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${fixture.origin}/lit-in-preact`);
  for (const id of ['#hydrated', '#only']) {
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
    .poll(() => shadow(page, '#only tag-list', 'li'))
    .toEqual(['from', 'preact']);
  // Hydrated, it sets it when its state next changes: Preact's hydration
  // leaves properties as the server's HTML had them.
  for (const id of ['#hydrated', '#only']) {
    await page.locator(`${id} .more`).click();
    await expect
      .poll(() => shadow(page, `${id} tag-list`, 'li'))
      .toEqual(['from', 'preact', 'more']);
  }
  expect(errors).toEqual([]);
});
