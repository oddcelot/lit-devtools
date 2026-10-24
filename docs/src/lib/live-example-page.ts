/**
 * An example's index.html, taken apart for its live demo page
 * (src/pages/live-panel/examples/[name]/demo.astro), at build time.
 *
 * The page keeps the example's head (styles, links) and body as written,
 * with three changes:
 *
 * - its module scripts go: the demo page loads the example's entry itself,
 *   behind the page runtime (src/lib/live-examples.ts);
 * - the tags the demo page writes itself (charset, viewport, title) go;
 * - a stylesheet it links from the example's source (`./src/index.css`),
 *   which a dev server would serve, is inlined, as only public/ files are
 *   served beside the demo page;
 * - root-relative `href` and `src` URLs, which a dev server resolves against
 *   the example's root, point at the demo page's own URL, where its public/
 *   files are served.
 */
const pages = import.meta.glob<string>('../../../examples/*/index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const sheets = import.meta.glob<string>('../../../examples/*/src/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

interface ExamplePage {
  /** The example's `<title>`. */
  title: string;
  /** What goes in the demo page's `<head>`. */
  head: string;
  /** What goes in the demo page's `<body>`. */
  body: string;
}

const MODULE_SCRIPT =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=[^>]*>\s*<\/script>/gi;
const OWN_TAGS =
  /<meta\s+(?:charset|name=["']viewport["'])[^>]*>|<title>[\s\S]*?<\/title>/gi;

const SOURCE_SHEET =
  /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']\.?\/(src\/[^"']+\.css)["'][^>]*>/gi;

const inner = (html: string, tag: string): string =>
  html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)</${tag}>`, 'i'))?.[1] ??
  '';

export const examplePage = (name: string, base: string): ExamplePage => {
  const html = pages[`../../../examples/${name}/index.html`];
  if (html === undefined) {
    throw new Error(`examples/${name}/index.html not found`);
  }
  const clean = (part: string) =>
    part
      .replace(SOURCE_SHEET, (link, path: string) => {
        const css = sheets[`../../../examples/${name}/${path}`];
        return css === undefined ? link : `<style>\n${css}</style>`;
      })
      .replace(MODULE_SCRIPT, '')
      .replace(OWN_TAGS, '')
      .replace(/\b(href|src)=(["'])\/(?!\/)/g, `$1=$2${base}`)
      .replace(/\n\s*\n/g, '\n')
      .trim();
  return {
    title: html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? name,
    head: clean(inner(html, 'head')),
    body: clean(inner(html, 'body')),
  };
};
