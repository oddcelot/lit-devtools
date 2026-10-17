/**
 * `examples/astro`'s Preact setup built (`astro.multi.config.mjs`): Lit's
 * renderer next to another one, each hydrating its own islands, and
 * `client:only="lit"` resolving to Lit by the renderer's name.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {counterHydrates, open, shadow} from './astro-build-utils.js';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    config: 'astro.multi.config.mjs',
    build: true,
  });
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

test('both renderers hydrate their islands, and client:only="lit" finds Lit', async () => {
  const {page} = fixture;
  const errors = await open(fixture);
  await counterHydrates(page);
  await page.locator('#preact').click();
  await expect
    .poll(() => page.locator('#preact').textContent())
    .toBe('Preact: 1');
  await expect.poll(() => shadow(page, '#island', 'li')).toEqual(['island']);
  await expect.poll(() => shadow(page, '#only', 'li')).toEqual(['only']);
  expect(errors).toEqual([]);
});
