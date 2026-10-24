/**
 * The examples published as live demos: the DevTools panel inspecting
 * examples/<name>/ at /live-panel/examples/<name>/, with no dev server
 * (src/pages/live-panel/examples/). One line here publishes an example.
 *
 * Each entry loads the module the example's index.html runs. The demo page
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
type LiveExample = (() => Promise<unknown>) | {build: 'own-config'};

export const liveExamples: Record<string, LiveExample> = {
  flame: () => import('../../../examples/flame/src/lit-flame.ts'),
  css: {build: 'own-config'},
  tailwind: {build: 'own-config'},
};

/** The examples built with their own vite.config.ts. */
export const ownConfigExamples = (): string[] =>
  Object.keys(liveExamples).filter(
    (name) => typeof liveExamples[name] !== 'function'
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
