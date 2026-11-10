// First, before Lit itself loads: server-rendered elements then hydrate
// instead of rendering a second copy into their shadow roots.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import {hydrate} from '@lit-labs/ssr-client';
import {compose} from './compose.ts';
import {takeOver} from './navigation.ts';
import {decode} from './serialize.ts';
import {DATA_ID, OUTLET_ID, type Payload} from './shared.ts';
import {
  remember,
  show,
  shownPage,
  usesFile,
  viewOf,
  type Site,
} from './site.ts';

/**
 * Hydrates the page the server rendered: the same templates with the same
 * data, so Lit adopts the DOM it finds instead of building it again. Then
 * the router takes over the navigations that follow.
 *
 * The page modules, and the components they import, load after this one.
 */
export const boot = async (site: Site): Promise<void> => {
  const script = document.getElementById(DATA_ID);
  const outlet = document.getElementById(OUTLET_ID);
  if (!script || !outlet) return;
  const payload = decode<Payload>(script.textContent!);
  hydrate(compose(await viewOf(site, payload.route), payload), outlet);
  remember(payload);
  takeOver(site, outlet);
};

/**
 * A page or layout module, edited in dev: the router takes the new one from
 * now on, and when the page on screen renders with it, it renders again
 * with the data it has. The Lit plugin keeps the DOM of the templates that
 * didn't change, so the elements in the page keep their state.
 */
export const hotModule = async (
  site: Site,
  file: string,
  module: {default: unknown}
): Promise<void> => {
  site.files[file] = () => Promise.resolve(module);
  const shown = shownPage();
  const outlet = document.getElementById(OUTLET_ID);
  if (!shown || !outlet || !usesFile(site, shown.route, file)) return;
  const view = await viewOf(site, shown.route);
  keepChildState();
  show(outlet, view, shown);
};

/**
 * An edited template is a new template to Lit, which clones fresh DOM for
 * it, components included. The Lit plugin's patch runtime pairs each
 * element dropped in the next moment with its replacement and carries the
 * state over, as it does for a component's own template; this opens that
 * window. Its state sits under a global key, as no public hook exists yet.
 */
const keepChildState = () => {
  const patch = (globalThis as Record<symbol, unknown>)[PATCH] as
    | {childState?: {open(): void}}
    | undefined;
  patch?.childState?.open();
};

const PATCH = Symbol.for('@oddsquad/vite-plugin-lit#patch');
