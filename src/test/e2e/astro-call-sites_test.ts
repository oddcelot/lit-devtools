/**
 * Where an element written in `.astro` markup is rendered. The transform only
 * stamps call sites in `html` templates and HTML entries, and never sees
 * `.astro` markup; Astro's dev server marks that markup itself, for its
 * toolbar, and the inspector reads those marks as the call site, even after
 * the toolbar has taken them off the element.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

const COLLECT = decodeURIComponent(
  new URL('../../../lib/runtime/inspector/collect.js', import.meta.url).pathname
);

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture();
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

/**
 * The inspector's call site for the first `tag` on the page, searching
 * shadow roots too.
 */
const callSiteOf = (tag: string) =>
  fixture.page.evaluate(
    // A string, so the test runner leaves the dynamic import alone.
    `import('/@fs${COLLECT}').then(({collectDetails}) => {
      const find = (root) => {
        const hit = root.querySelector('${tag}');
        if (hit) return hit;
        for (const el of root.querySelectorAll('*')) {
          const found = el.shadowRoot && find(el.shadowRoot);
          if (found) return found;
        }
        return null;
      };
      return collectDetails(find(document)).callSite;
    })`
  );

test('an element written in .astro markup has a call site', async () => {
  const {page, origin} = fixture;
  await page.goto(`${origin}/basics`);
  // The first import of the inspector module may make Vite optimize a
  // dependency and reload; take it once, then start from a settled page.
  await callSiteOf('ssr-counter').catch(() => undefined);
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Astro's toolbar takes its marks off the element once it runs.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('[data-astro-source-file]') === null
      )
    )
    .toBe(true);
  expect(await callSiteOf('ssr-counter')).toEqual({
    file: expect.stringMatching(/\/src\/pages\/basics\.astro$/),
    line: 26,
    column: 6,
  });
}, 60_000);

test("a template's own stamp still wins inside a Lit component", async () => {
  const {page, origin} = fixture;
  await page.goto(`${origin}/nested`);
  await page.waitForLoadState('networkidle');

  expect(await callSiteOf('task-item')).toMatchObject({
    file: 'src/components/task-list.ts',
  });
}, 60_000);
