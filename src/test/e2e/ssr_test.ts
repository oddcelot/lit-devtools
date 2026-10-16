/**
 * A page the server renders with `@lit-labs/ssr` and the browser hydrates,
 * under the plugin (`examples/ssr`). The baseline the SSR work builds on:
 * the HTML arrives with declarative shadow roots, components hydrate in
 * place rather than rendering a second copy, and `defer-hydration` holds an
 * element back until it is removed.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {
  INSPECT_CMD_CHANNEL,
  INSPECT_DATA_CHANNEL,
  type InspectorMessage,
  type InspectorTreeNode,
} from '../../types/inspector.js';
import {type SsrFixture, startSsrFixture} from './ssr-utils.js';

let fixture: SsrFixture;

beforeAll(async () => {
  fixture = await startSsrFixture();
});

afterAll(async () => {
  await fixture?.close();
});

/** Set by `<ssr-counter>` once its hydration has run. */
const hydrated = () =>
  fixture.page.evaluate(
    `document.querySelector('ssr-counter')?.hasAttribute('hydrated') ?? false`
  ) as Promise<boolean>;

const shadow = (selector: string, inner: string) =>
  fixture.page.evaluate(
    `[...(document.querySelector(${JSON.stringify(selector)})?.shadowRoot?.querySelectorAll(${JSON.stringify(inner)}) ?? [])].map((n) => n.textContent.trim())`
  ) as Promise<string[]>;

test('the server sends the components rendered, in declarative shadow roots', async () => {
  const html = await (await fetch(`${fixture.origin}/`)).text();
  expect(html).toMatch(
    /<ssr-counter\s+start="3"><template shadowroot(mode)?="open"/
  );
  expect(html).toContain('Count: <!--lit-part-->3<!--/lit-part-->');
  expect(html).toContain('<ssr-deferred  defer-hydration>');
});

test('a component hydrates in place, without a second render', async () => {
  const {page} = fixture;
  await page.goto(`${fixture.origin}/`);
  await expect.poll(hydrated).toBe(true);
  // A client render over the server's DOM would leave two buttons.
  expect(await shadow('ssr-counter', 'button')).toEqual(['Count: 3']);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow('ssr-counter', 'button'))
    .toEqual(['Count: 4']);
});

test('defer-hydration holds an element back until it is removed', async () => {
  const {page} = fixture;
  await page.goto(`${fixture.origin}/`);
  await expect.poll(hydrated).toBe(true);
  await page.locator('ssr-deferred #poke').click();
  expect(await shadow('ssr-deferred', 'button')).toEqual(['Clicks: 0']);

  await page.locator('#wake').click();
  await page.locator('ssr-deferred #poke').click();
  await expect
    .poll(() => shadow('ssr-deferred', 'button'))
    .toEqual(['Clicks: 1']);
});

test('an edit patches a hydrated component in place, keeping its state', async () => {
  const {page} = fixture;
  await page.goto(`${fixture.origin}/`);
  await expect.poll(hydrated).toBe(true);
  await page.locator('ssr-counter #increment').click();
  await expect
    .poll(() => shadow('ssr-counter', 'button'))
    .toEqual(['Count: 4']);
  await page.evaluate(`window.__kept = document.querySelector('ssr-counter')`);

  await fixture.edit('src/ssr-counter.ts', (code) =>
    code.replace('<h2>Counter</h2>', '<h2>Tally</h2>')
  );
  await expect
    .poll(() => shadow('ssr-counter', 'h2'), {timeout: 10_000})
    .toEqual(['Tally']);
  expect(await shadow('ssr-counter', 'button')).toEqual(['Count: 4']);
  expect(
    await page.evaluate(
      `window.__kept === document.querySelector('ssr-counter')`
    )
  ).toBe(true);
});

test('after an edit, the next server render uses the new code', async () => {
  await fixture.edit('src/ssr-counter.ts', (code) =>
    code.replace(/<h2>\w+<\/h2>/, '<h2>Edited on the server</h2>')
  );
  await expect
    .poll(
      async () => {
        const res = await fetch(`${fixture.origin}/`);
        return (await res.text()).includes('<h2>Edited on the server</h2>');
      },
      {timeout: 10_000}
    )
    .toBe(true);
  // And the open page has it too, so the next load gets the new client code.
  await expect
    .poll(() => shadow('ssr-counter', 'h2'), {timeout: 10_000})
    .toEqual(['Edited on the server']);
});

test('a deferred element edited before it hydrates hydrates with the new code', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${fixture.origin}/`);
  await expect.poll(hydrated).toBe(true);

  await fixture.edit('src/ssr-deferred.ts', (code) =>
    code.replace('<h2>Deferred</h2>', '<h2>Held</h2>')
  );
  // The patch has landed once the class renders the new heading.
  await expect
    .poll(
      () =>
        page.evaluate(
          `customElements.get('ssr-deferred').prototype.render.toString().includes('Held')`
        ),
      {timeout: 10_000}
    )
    .toBe(true);
  // Still held back, showing the server's HTML: the patch must not
  // hydrate it early.
  expect(await shadow('ssr-deferred', 'h2')).toEqual(['Deferred']);
  await page.locator('#wake').click();
  await expect
    .poll(() => shadow('ssr-deferred', 'h2'), {timeout: 10_000})
    .toEqual(['Held']);
  await page.locator('ssr-deferred #poke').click();
  await expect
    .poll(() => shadow('ssr-deferred', 'button'))
    .toEqual(['Clicks: 1']);
  expect(errors).toEqual([]);
});

const noteColor = () =>
  fixture.page.evaluate(
    `getComputedStyle(document.querySelector('ssr-themed').shadowRoot.querySelector('.note')).color`
  );

test('a shared sheet renders on the server and applies after hydration', async () => {
  const html = await (await fetch(`${fixture.origin}/`)).text();
  const themed = html.slice(html.indexOf('<ssr-themed'));
  expect(themed).toMatch(/<style>[^<]*\.note\s*\{[^<]*rgb\(0, 128, 0\)/);

  await fixture.page.goto(`${fixture.origin}/`);
  await expect.poll(noteColor).toBe('rgb(0, 128, 0)');
});

test('an edit to the shared sheet restyles a hydrated component', async () => {
  await fixture.page.goto(`${fixture.origin}/`);
  await expect.poll(noteColor).toBe('rgb(0, 128, 0)');
  await fixture.edit('src/theme.css', (css) =>
    css.replace('rgb(0, 128, 0)', 'rgb(0, 0, 255)')
  );
  await expect.poll(noteColor, {timeout: 10_000}).toBe('rgb(0, 0, 255)');
});

test('the Components tree says where hydration stands', async () => {
  let roots: InspectorTreeNode[] = [];
  fixture.vite.hot.on(INSPECT_DATA_CHANNEL, (data: InspectorMessage) => {
    if (data.type === 'tree') roots = data.roots;
  });
  const states = () => {
    fixture.vite.hot.send(INSPECT_CMD_CHANNEL, {type: 'tree'});
    return Object.fromEntries(roots.map((n) => [n.tagName, n.ssr]));
  };
  await fixture.page.goto(`${fixture.origin}/`);
  await expect.poll(hydrated).toBe(true);
  await expect.poll(states, {timeout: 10_000}).toEqual({
    'ssr-counter': 'hydrated',
    'ssr-deferred': 'deferred',
    'ssr-themed': 'hydrated',
  });
  await fixture.page.locator('#wake').click();
  await expect
    .poll(() => states()['ssr-deferred'], {timeout: 10_000})
    .toBe('hydrated');
});
