/**
 * The examples published as live demos: the DevTools panel inspecting
 * examples/<name>/ at /live-panel/examples/<name>/, with no dev server
 * (src/pages/live-panel/examples/). One entry here publishes an example.
 *
 * Each entry loads the module the example's index.html runs. The demo page
 * takes the rest of index.html, its styles and markup, as it is, and
 * serves the example's public/ files beside itself (see
 * `liveExamplesPublic` in astro.config.mjs). The example's Lit resolves to
 * the development build there (`liveDemoDevLit`), so the Timeline's render
 * lanes fill. The docs list the demo next to the example's StackBlitz embed.
 *
 * The docs build bundles the example with the docs' own Vite config, not the
 * example's: an example that needs a plugin of its own (Tailwind, UnoCSS)
 * needs it in the docs too.
 */
export const liveExamples: Record<string, LiveExample> = {
  flame: {
    load: () => import('../../../examples/flame/src/lit-flame.ts'),
    demoRow: 'minmax(24rem, 50%)',
  },
};

interface LiveExample {
  /** Loads the module the example's index.html runs. */
  load: () => Promise<unknown>;
  /** The demo frame's row above the panel, as a grid track size, for an
   *  example whose page needs more (or less) than LivePanelPage's default
   *  to show what there is to click. */
  demoRow?: string;
}

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
