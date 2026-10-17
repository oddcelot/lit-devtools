import {afterEach, describe, expect, test, vi} from 'vite-plus/test';
import {HTMLElement} from '@lit-labs/ssr-dom-shim';
import {LitElement, html} from 'lit';
import renderer from '../../lib/astro/server.js';

/**
 * The Astro renderer's server half end to end, on Lit's node build: which
 * components it claims, and the markup Astro puts in the page for them.
 */

class RenderedCard extends LitElement {
  static override properties = {
    heading: {},
    count: {type: Number, attribute: 'item-count', reflect: true},
    tags: {attribute: false},
  };
  declare heading: string;
  declare count: number;
  declare tags: string[];

  constructor() {
    super();
    this.heading = 'Untitled';
    this.count = 0;
    this.tags = [];
  }

  override render() {
    return html`<h2>${this.heading}</h2>
      <ul>
        ${this.tags.map((tag) => html`<li>${tag}</li>`)}
      </ul>
      <slot name="footer"></slot><slot></slot>`;
  }
}
customElements.define('rendered-card', RenderedCard);

class FocusField extends LitElement {
  static override shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };
  override render() {
    return html`<input />`;
  }
}
customElements.define('focus-field', FocusField);

class PlainElement extends HTMLElement {}
customElements.define('plain-element', PlainElement as never);

const render = async (
  tag: string,
  props: Record<string, unknown> = {},
  slots?: Record<string, string>,
  metadata?: {hydrate?: string}
) => (await renderer.renderToStaticMarkup(tag, props, slots, metadata)).html;

/** The markup with Lit's hydration comments taken out. */
const bare = (markup: string) => markup.replaceAll(/<!--[^]*?-->/g, '');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('check', () => {
  test('claims Lit elements by tag and by class', async () => {
    expect(await renderer.check('rendered-card')).toBe(true);
    expect(await renderer.check(RenderedCard)).toBe(true);
  });

  test('leaves other components alone', async () => {
    expect(await renderer.check('plain-element')).toBe(false);
    expect(await renderer.check(PlainElement)).toBe(false);
    expect(await renderer.check('not-defined')).toBe(false);
    expect(await renderer.check('div')).toBe(false);
    expect(await renderer.check(() => null)).toBe(false);
  });
});

describe('renderToStaticMarkup', () => {
  test('renders the shadow root declaratively, with the props applied', async () => {
    const markup = bare(await render('rendered-card', {heading: 'Hello'}));
    expect(markup).toMatch(
      /^<rendered-card heading="Hello" item-count="0"><template shadowrootmode="open">/
    );
    expect(markup).toContain('<h2>Hello</h2>');
    expect(markup).toMatch(/<\/template><\/rendered-card>$/);
  });

  test('renders a class the way it renders its tag', async () => {
    expect(
      await renderer.renderToStaticMarkup(RenderedCard, {heading: 'A'})
    ).toEqual({html: await render('rendered-card', {heading: 'A'})});
  });

  test("writes attributes, a property's under its attribute name", async () => {
    const markup = await render('rendered-card', {
      count: 3,
      id: 'card',
      hidden: true,
      open: false,
    });
    const host = markup.slice(0, markup.indexOf('>') + 1);
    expect(host).toContain(' item-count="3"');
    expect(host).toContain(' id="card"');
    expect(host).toContain(' hidden');
    expect(host).not.toContain('open');
    expect(host).not.toContain('defer-hydration');
  });

  test('defers a plain tag with properties, carrying them as JSON', async () => {
    const markup = await render('rendered-card', {
      tags: ['a & b', 'say "hi"'],
    });
    const host = markup.slice(0, markup.indexOf('>') + 1);
    expect(host).toContain(' defer-hydration');
    expect(host).toContain(
      ' data-lit-props="{&quot;tags&quot;:[&quot;a &amp; b&quot;,&quot;say \\&quot;hi\\&quot;&quot;]}"'
    );
    expect(bare(markup)).toContain('<li>a &amp; b</li>');
  });

  test("defers an island without the JSON, which Astro's props carry", async () => {
    const markup = await render('rendered-card', {tags: ['a']}, undefined, {
      hydrate: 'load',
    });
    expect(markup).toMatch(/^<rendered-card defer-hydration data-lit-props=""/);
  });

  test("carries what JSON alone loses with Astro's tags", async () => {
    const markup = await render('rendered-card', {tags: [new Date(0)]});
    const host = markup.slice(0, markup.indexOf('>') + 1);
    expect(host).toContain(
      ' data-lit-props="[0,{&quot;tags&quot;:[1,[[3,&quot;1970-01-01T00:00:00.000Z&quot;]]]}]"'
    );
  });

  test('defers an island without properties too, until its directive fires', async () => {
    const markup = await render('rendered-card', {heading: 'A'}, undefined, {
      hydrate: 'visible',
    });
    expect(markup).toMatch(/^<rendered-card defer-hydration data-lit-props=""/);
    expect(await render('rendered-card', {heading: 'A'})).not.toContain(
      'defer-hydration'
    );
  });

  test('warns about the properties a plain tag cannot carry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render('rendered-card', {tags: [], onPick: () => {}});
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('<rendered-card> got `onPick`');
  });

  test('puts the default slot in as is and assigns the named ones', async () => {
    const markup = await render(
      'rendered-card',
      {},
      {
        default: '<p>Body</p>',
        footer: '<a href="/">Home</a> end',
      }
    );
    expect(markup).toMatch(
      /<\/template><p>Body<\/p><a slot="footer" href="\/">Home<\/a><span slot="footer"> end<\/span><\/rendered-card>$/
    );
  });

  test('keeps the shadow root options', async () => {
    expect(await render('focus-field')).toMatch(
      /^<focus-field><template shadowrootmode="open" shadowrootdelegatesfocus>/
    );
  });
});
