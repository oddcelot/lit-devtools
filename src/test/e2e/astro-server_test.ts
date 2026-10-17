/**
 * `examples/astro` built for on-demand rendering with the Node adapter
 * (`astro.server.config.mjs`) and served by Astro's preview: each request
 * renders the page, which hydrates as a static build's does.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {counterHydrates, open, shadow} from './astro-build-utils.js';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    config: 'astro.server.config.mjs',
    build: true,
  });
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

test('each request renders the page, which hydrates', async () => {
  const html = await (await fetch(`${fixture.origin}/`)).text();
  expect(html).toMatch(
    /<ssr-counter start="3"><template shadowrootmode="open">/
  );
  expect(html).toMatch(
    /<tag-list defer-hydration data-lit-props="\{&quot;tags&quot;:\[&quot;lit&quot;,&quot;astro&quot;\]\}" id="plain">/
  );
  const errors = await open(fixture);
  await counterHydrates(fixture.page);
  await expect
    .poll(() => shadow(fixture.page, '#plain', 'li'))
    .toEqual(['lit', 'astro']);
  expect(errors).toEqual([]);
});
