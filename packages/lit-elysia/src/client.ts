// First, before Lit itself loads: server-rendered elements then hydrate
// instead of rendering a second copy into their shadow roots.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import {hydrate} from '@lit-labs/ssr-client';
import {render} from 'lit';
import type {Page} from './page.ts';
import {
  pageFor,
  remember,
  shownPage,
  takeOver,
  type ClientRoutes,
} from './navigation.ts';
import {decode} from './serialize.ts';
import {DATA_ID, OUTLET_ID, type Payload} from './shared.ts';

/**
 * Hydrates the page the server rendered: the same template with the same
 * data, so Lit adopts the DOM it finds instead of building it again. Then
 * the router takes over the navigations that follow.
 *
 * The page modules, and the components they import, load after this one.
 */
export const boot = async (routes: ClientRoutes): Promise<void> => {
  const script = document.getElementById(DATA_ID);
  const outlet = document.getElementById(OUTLET_ID);
  if (!script || !outlet) return;
  const payload = decode<Payload>(script.textContent!);
  const page = (await pageFor(routes, payload.route)()).default;
  hydrate(page.render(payload.data), outlet);
  remember(payload);
  takeOver(routes, outlet);
};

/**
 * A page module, edited in dev: the router takes the new one from now on,
 * and when it is the page on screen, it renders again with the data it
 * has. The Lit plugin keeps the DOM of the templates that didn't change,
 * so the elements in the page keep their state.
 */
export const hotPage = (
  routes: ClientRoutes,
  route: string,
  module: {default: Page<unknown>}
): void => {
  routes[route] = () => Promise.resolve(module);
  const shown = shownPage();
  if (shown?.route === route) rerender(module.default, shown.data);
};

const rerender = (page: Page<unknown>, data: unknown) => {
  const outlet = document.getElementById(OUTLET_ID);
  if (!outlet) return;
  keepChildState();
  render(page.render(data), outlet);
  const title = page.title?.(data);
  if (title !== undefined) document.title = title;
};

/**
 * An edited page template is a new template to Lit, which clones fresh DOM
 * for it, components included. The Lit plugin's patch runtime pairs each
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
