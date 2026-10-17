/**
 * Props of the types Astro serializes for islands (Date, Map, Set, URL,
 * BigInt, RegExp, typed arrays, Infinity, undefined), through the renderer,
 * to an island and to a plain tag, which carries them in its marker with
 * Astro's tags. The server renders with the values as given; the browser
 * must end up with the same ones, or hydration renders something else.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

const COMPONENT = `import {LitElement, html} from 'lit';

const NAMES = ['when', 'map', 'set', 'url', 'big', 'pattern', 'bytes', 'far', 'dates', 'missing'];

const describe = (v: unknown): string =>
  v instanceof Date
    ? \`Date \${v.toISOString()}\`
    : v instanceof Map
      ? \`Map \${[...v].map(([k, x]) => \`\${k}: \${describe(x)}\`).join(', ')}\`
      : v instanceof Set
        ? \`Set \${[...v].map(describe).join(', ')}\`
        : v instanceof URL
          ? \`URL \${v.href}\`
          : typeof v === 'bigint'
            ? \`BigInt \${v}\`
            : v instanceof RegExp
              ? \`RegExp \${v.source}\`
              : v instanceof Uint8Array
                ? \`Uint8Array \${[...v].join(' ')}\`
                : Array.isArray(v)
                  ? \`[\${v.map(describe).join(', ')}]\`
                  : String(v);

export class PropTypes extends LitElement {
  static override properties = Object.fromEntries(
    NAMES.map((name) => [name, {attribute: false}])
  );

  override render() {
    const self = this as unknown as Record<string, unknown>;
    return html\`<ul>
      \${NAMES.map((name) => html\`<li>\${name}: \${describe(self[name])}</li>\`)}
    </ul>\`;
  }
}
customElements.define('prop-types', PropTypes);
`;

const PAGE = `---
import {PropTypes} from '../props/prop-types.ts';

const props = {
  when: new Date(0),
  map: new Map([['a', new Date(0)]]),
  set: new Set([1, 2]),
  url: new URL('https://lit.dev/'),
  big: 10n,
  pattern: /a+b/,
  bytes: new Uint8Array([1, 2]),
  far: Infinity,
  dates: [new Date(0)],
  missing: undefined,
};
---

<html lang="en">
  <head>
    <title>Props</title>
    <link rel="icon" href="/favicon.svg" />
  </head>
  <body>
    <PropTypes id="island" client:load {...props} />
    <prop-types id="plain" {...props} />
    <script>
      import '../props/prop-types.ts';
    </script>
  </body>
</html>
`;

const EXPECTED = [
  'when: Date 1970-01-01T00:00:00.000Z',
  'map: Map a: Date 1970-01-01T00:00:00.000Z',
  'set: Set 1, 2',
  'url: URL https://lit.dev/',
  'big: BigInt 10',
  'pattern: RegExp a+b',
  'bytes: Uint8Array 1 2',
  'far: Infinity',
  'dates: [Date 1970-01-01T00:00:00.000Z]',
  'missing: undefined',
];

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    files: {
      'src/props/prop-types.ts': COMPONENT,
      'src/pages/props.astro': PAGE,
    },
  });
});

afterAll(async () => {
  await fixture?.close();
});

/** What the element shows once it renders again, from its own values. */
const rerendered = (id: string) =>
  fixture.page.evaluate(
    `(async () => {
      const el = document.getElementById(${JSON.stringify(id)});
      if (el.hasAttribute('defer-hydration')) return null;
      el.requestUpdate();
      await el.updateComplete;
      return [...el.shadowRoot.querySelectorAll('li')].map((li) => li.textContent);
    })()`
  );

/** The `<li>` texts the server rendered into the element with `id`. */
const served = async (id: string) => {
  const html = await (await fetch(`${fixture.origin}/props`)).text();
  const from = html.indexOf(`id="${id}"`);
  const element = html.slice(from, html.indexOf('</prop-types>', from));
  return [
    ...element.replaceAll(/<!--[^]*?-->/g, '').matchAll(/<li>([^<]*)<\/li>/g),
  ].map(([, text]) => text);
};

test('an island hydrates with the props Astro serialized, of every type it carries', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  expect(await served('island')).toEqual(EXPECTED);
  await page.goto(`${fixture.origin}/props`);
  await expect.poll(() => rerendered('island')).toEqual(EXPECTED);
  expect(errors).toEqual([]);
});

test('a plain tag hydrates with the same types, carried in its marker', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  expect(await served('plain')).toEqual(EXPECTED);
  await page.goto(`${fixture.origin}/props`);
  await expect.poll(() => rerendered('plain')).toEqual(EXPECTED);
  expect(errors).toEqual([]);
});
