/**
 * `shadowRootPolyfill: true` built and served: the page script imports the
 * polyfill ahead of the boot script, and in a browser that parses
 * declarative shadow roots itself it leaves them be. The path for one that
 * can't is `src/test/dom/astro-polyfill_test.ts`; no Chrome flag turns the
 * parsing off.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {counterHydrates, open, shadow} from './astro-build-utils.js';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

const CONFIG = `import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import lit from '@oddsquad/lit-devtools/astro';

export default defineConfig({
  adapter: node({mode: 'standalone'}),
  integrations: [
    preact({include: ['**/*.tsx']}),
    lit({shadowRootPolyfill: true}),
  ],
});
`;

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    config: 'astro.polyfill.config.mjs',
    build: true,
    files: {'astro.polyfill.config.mjs': CONFIG},
  });
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

test('the page hydrates the server HTML with the polyfill loaded', async () => {
  const errors = await open(fixture);
  await counterHydrates(fixture.page);
  await expect
    .poll(() => shadow(fixture.page, '#plain', 'li'))
    .toEqual(['lit', 'astro']);
  // Hydrated, not rendered again: the server's markers are still there.
  expect(
    await fixture.page.evaluate(
      `[...document.querySelector('ssr-counter').shadowRoot.childNodes].some((n) => n.nodeType === 8 && n.data.startsWith('lit-part '))`
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});
