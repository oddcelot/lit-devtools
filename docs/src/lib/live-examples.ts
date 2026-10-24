/**
 * The examples published as live demos: the DevTools panel inspecting
 * examples/<name>/ at /live-panel/examples/<name>/, with no dev server
 * (src/pages/live-panel/examples/). An entry here publishes an example,
 * with its entry module's loader in live-example-loaders.ts.
 *
 * This module holds no imports of the examples on purpose: the pages that
 * read it (the Demos page, the panel pages) would otherwise take every
 * example's global CSS, such as Web Awesome's native styles. The demo page
 * takes the rest of index.html, its styles and markup, as it is, and
 * serves the example's public/ files beside itself (see
 * `liveExamplesPublic` in astro.config.mjs). The example's Lit resolves to
 * the development build there (`liveDemoDevLit`), so the Timeline's render
 * lanes fill. The docs list the demo next to the example's StackBlitz embed.
 *
 * The docs build bundles the example with the docs' own Vite config. An
 * example whose styles need build plugins of its own (UnoCSS, Tailwind,
 * Lightning CSS targets) is marked `{build: 'own-config'}` instead: it is
 * built apart with its own vite.config.ts, from the entry its index.html
 * runs, and the demo page loads that build (src/lib/live-examples-own-build.mjs).
 */
interface LiveExample {
  /** Build the example apart, with its own vite.config.ts. */
  build?: 'own-config';
  /** The demo frame's row above the panel, as a grid track size, for an
   *  example whose page needs more (or less) than LivePanelPage's default
   *  to show what there is to click. */
  demoRow?: string;
}

export const liveExamples: Record<string, LiveExample> = {
  flame: {
    demoRow: 'minmax(24rem, 50%)',
  },
  forms: {
    demoRow: 'minmax(24rem, 55%)',
  },
  fernhouse: {
    demoRow: 'minmax(24rem, 55%)',
  },
  // Own config: its global webawesome.css would otherwise reach every
  // demo frame, which share one client script.
  'web-awesome': {build: 'own-config', demoRow: 'minmax(26rem, 55%)'},
  tutorial: {
    demoRow: 'minmax(18rem, 45%)',
  },
  css: {build: 'own-config', demoRow: 'minmax(24rem, 55%)'},
  tailwind: {build: 'own-config', demoRow: 'minmax(24rem, 55%)'},
};

/** The examples built with their own vite.config.ts. */
export const ownConfigExamples = (): string[] =>
  Object.keys(liveExamples).filter(
    (name) => liveExamples[name]?.build === 'own-config'
  );

/** The examples published as live demos, as `getStaticPaths()` lists them. */
export const liveExamplePaths = () =>
  Object.keys(liveExamples).map((name) => ({params: {name}}));

/** The live demo of the example at `path` in the repo, such as
 *  `examples/flame`, if it has one. */
export const liveDemoUrl = (path: string): string | undefined => {
  const name = path.match(/^examples\/([^/]+)\/?$/)?.[1];
  return name !== undefined && Object.hasOwn(liveExamples, name)
    ? `/live-panel/examples/${name}/`
    : undefined;
};
