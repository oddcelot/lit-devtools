import {experimental_AstroContainer as AstroContainer} from 'astro/container';
import {loadRenderers} from 'astro:container';
import {getContainerRenderer} from '@oddsquad/vite-plugin-lit/astro';
import {expect, test} from 'vitest';
import Page from '../src/pages/basics.astro';

test('renders the page with the Lit renderer through the container API', async () => {
  const renderers = await loadRenderers([getContainerRenderer()]);
  const container = await AstroContainer.create({renderers});
  const html = await container.renderToString(Page);

  // A plain tag: its array rides along as JSON, its shadow root is inline.
  expect(html).toMatch(
    /<tag-list defer-hydration data-lit-props="\{&quot;tags&quot;:\[&quot;lit&quot;,&quot;astro&quot;\]\}"/
  );
  expect(html).toContain('<template shadowrootmode="open">');
  // A `?css-sheet` import, rendered into the shadow root on the server.
  const themed = html.slice(
    html.indexOf('<ssr-themed'),
    html.indexOf('</ssr-themed>')
  );
  expect(themed).toMatch(/^<ssr-themed[^>]*><template shadowrootmode="open">/);
  expect(themed).toMatch(/<style>[^<]*\.note \{/);
  // A hand-written defer-hydration, without the renderer's marker.
  expect(html).toMatch(/<ssr-deferred defer-hydration(?! data-lit-props)/);
});
