// First, before Lit itself loads: server-rendered elements then hydrate
// instead of rendering a second copy into their shadow roots.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import {hydrate} from '@lit-labs/ssr-client';
import type {Page} from './page.ts';
import {DATA_ID, OUTLET_ID, type Payload} from './shared.ts';

export type ClientRoutes = Record<
  string,
  () => Promise<{default: Page<unknown>}>
>;

/**
 * Hydrates the page the server rendered: the same template with the same
 * data, so Lit adopts the DOM it finds instead of building it again.
 *
 * The page modules, and the components they import, load after this one.
 */
export const boot = async (routes: ClientRoutes): Promise<void> => {
  const script = document.getElementById(DATA_ID);
  const outlet = document.getElementById(OUTLET_ID);
  if (!script || !outlet) return;
  const {route, data} = JSON.parse(script.textContent!) as Payload;
  const page = (await pageFor(routes, route)()).default;
  hydrate(page.render(data), outlet);
};

const pageFor = (routes: ClientRoutes, route: string) => {
  const load = routes[route];
  if (!load) throw new Error(`[lit-elysia] no page for route ${route}`);
  return load;
};
