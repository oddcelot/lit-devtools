/**
 * `examples/astro` built with the Node adapter and served by Astro's
 * preview: prebuilt pages hydrate as in dev, and `/on-demand/`, which sets
 * `prerender = false`, renders for each request.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {counterHydrates, open, shadow} from './astro-build-utils.js';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({build: true});
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

test('a prebuilt page hydrates, its marker carrying the array', async () => {
  const html = await (await fetch(`${fixture.origin}/basics/`)).text();
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

test('an on-demand page renders for each request, and hydrates with a Date', async () => {
  const at = async (name: string) => {
    const html = await (
      await fetch(`${fixture.origin}/on-demand/?name=${name}`)
    ).text();
    const text = html.replaceAll(/<!--[^]*?-->/g, '');
    expect(text).toContain(`Hello, ${name}`);
    return /<dd id="at">([^<]+)<\/dd>/.exec(text)![1];
  };
  const first = await at('Ada');
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await at('Grace')).not.toBe(first);

  const errors = await open(fixture, '/on-demand/?name=Ada');
  await expect
    .poll(() => shadow(fixture.page, '#card', '#type'))
    .toEqual(['Date']);
  await expect
    .poll(() => shadow(fixture.page, '#card', '#age'))
    .toEqual([expect.stringMatching(/^\d+ s ago$/)]);
  expect(errors).toEqual([]);
});
