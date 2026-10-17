/**
 * Lit elements inside Lit elements, rendered through Astro. One in another's
 * shadow root is rendered by `@lit-labs/ssr` along with its host, deferred
 * until the host hydrates and sets its bindings; one slotted from the page
 * is rendered by the renderer on its own. Either way each hydrates once,
 * with what the server rendered.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

const INNER = `import {LitElement, html} from 'lit';

export class InnerCount extends LitElement {
  static override properties = {
    start: {type: Number},
    label: {attribute: false},
    count: {state: true},
  };
  declare start: number;
  declare label: {text: string};
  declare count: number;

  constructor() {
    super();
    this.start = 0;
    this.label = {text: 'Unlabelled'};
    this.count = 0;
  }

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('start') && !this.hasUpdated) this.count = this.start;
  }

  override firstUpdated() {
    this.setAttribute('hydrated', '');
  }

  override render() {
    return html\`<button @click=\${() => this.count++}>\${this.label.text}: \${this.count}</button>\`;
  }
}
customElements.define('inner-count', InnerCount);
`;

const OUTER = `import {LitElement, html} from 'lit';
import './inner-count.ts';

export class OuterCard extends LitElement {
  static override properties = {start: {type: Number}};
  declare start: number;

  constructor() {
    super();
    this.start = 0;
  }

  override firstUpdated() {
    this.setAttribute('hydrated', '');
  }

  override render() {
    return html\`<inner-count .start=\${this.start} .label=\${{text: 'Inner'}}></inner-count><slot></slot>\`;
  }
}
customElements.define('outer-card', OuterCard);
`;

const PAGE = `---
import '../nested/outer-card.ts';
import {OuterCard} from '../nested/outer-card.ts';
---

<html lang="en">
  <head>
    <title>Nested</title>
    <link rel="icon" href="/favicon.svg" />
  </head>
  <body>
    <outer-card id="plain" start="2"></outer-card>
    <OuterCard id="island" client:load start={5} />
    <outer-card id="parent" start="1">
      <inner-count id="slotted" start="9"></inner-count>
    </outer-card>
    <script>
      import '../nested/outer-card.ts';
    </script>
  </body>
</html>
`;

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    files: {
      'src/nested/inner-count.ts': INNER,
      'src/nested/outer-card.ts': OUTER,
      'src/pages/nested.astro': PAGE,
    },
  });
});

afterAll(async () => {
  await fixture?.close();
});

/** The `<inner-count>` a selector names: in `#id`'s shadow root, or itself. */
const inner = (selector: string) =>
  selector === '#slotted'
    ? `document.querySelector('#slotted')`
    : `document.querySelector(${JSON.stringify(selector)}).shadowRoot.querySelector('inner-count')`;

const innerState = (selector: string) =>
  fixture.page.evaluate(
    `(() => {
      const el = ${inner(selector)};
      return {
        hydrated: el.hasAttribute('hydrated'),
        deferred: el.hasAttribute('defer-hydration'),
        buttons: [...el.shadowRoot.querySelectorAll('button')].map((b) => b.textContent),
      };
    })()`
  ) as Promise<{hydrated: boolean; deferred: boolean; buttons: string[]}>;

test("the server renders a nested element in its host's shadow root, deferred", async () => {
  const html = await (await fetch(`${fixture.origin}/nested`)).text();
  const plain = html.slice(html.indexOf('<outer-card id="plain"'));
  expect(plain).toMatch(
    /^<outer-card id="plain" start="2"[^>]*><template shadowrootmode="open">(<!--[^]*?-->)*<inner-count\s+defer-hydration[^>]*><template [^>]*shadowrootmode="open">/
  );
  // With its host's bindings applied: rendered, not left empty.
  const host = plain.slice(0, plain.indexOf('</outer-card>'));
  expect(host.replaceAll(/<!--[^]*?-->/g, '')).toContain(
    '<button >Inner: 2</button>'
  );
});

test('each nested element hydrates once, after its host, with its bindings', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${fixture.origin}/nested`);

  for (const [selector, label] of [
    ['#plain', 'Inner: 2'],
    ['#island', 'Inner: 5'],
    ['#parent', 'Inner: 1'],
    ['#slotted', 'Unlabelled: 9'],
  ] as const) {
    await expect
      .poll(() => innerState(selector))
      .toEqual({hydrated: true, deferred: false, buttons: [label]});
  }
  await page.evaluate(
    `${inner('#island')}.shadowRoot.querySelector('button').click()`
  );
  await expect
    .poll(async () => (await innerState('#island')).buttons)
    .toEqual(['Inner: 6']);
  expect(errors).toEqual([]);
});
