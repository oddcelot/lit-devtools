/**
 * Starlight route middleware: points every page's `og:image` at the image
 * `src/lib/og.ts` picks for it — the card `src/pages/og/[...slug].ts`
 * generated, or a release video's poster on a changelog release page.
 * Starlight already emits `twitter:card: summary_large_image` and the other OG
 * tags; the image is the only one it has no way to know about.
 *
 * It also links the page's Markdown copy, which `scripts/page-markdown.mjs`
 * writes beside it after the build, and the site's agent catalog in
 * `public/.well-known/ai-catalog.json`.
 */
import {defineRouteMiddleware} from '@astrojs/starlight/route-data';
import {ogImageFor} from './lib/og';

export const onRequest = defineRouteMiddleware((context) => {
  const {entry, head} = context.locals.starlightRoute;
  // The 404 page is Starlight's own, not a collection entry, so it has no card.
  if (entry.id === '404') return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const image = ogImageFor(entry.id, entry.data.title);
  const meta = (property: string, content: string) =>
    head.push({tag: 'meta', attrs: {property, content}});
  meta('og:image', new URL(`${base}/${image.path}`, context.site).href);
  meta('og:image:width', String(image.width));
  meta('og:image:height', String(image.height));
  meta('og:image:alt', image.alt);
  head.push({
    tag: 'link',
    attrs: {rel: 'alternate', type: 'text/markdown', href: 'index.md'},
  });
  head.push({
    tag: 'link',
    attrs: {rel: 'ai-catalog', href: '/.well-known/ai-catalog.json'},
  });
});
