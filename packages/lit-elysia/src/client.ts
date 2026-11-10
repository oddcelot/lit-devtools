// First, before Lit itself loads: server-rendered elements then hydrate
// instead of rendering a second copy into their shadow roots.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import {hydrate} from '@lit-labs/ssr-client';
import {pageFor, takeOver, type ClientRoutes} from './navigation.ts';
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
  const {route, data} = decode<Payload>(script.textContent!);
  const page = (await pageFor(routes, route)()).default;
  hydrate(page.render(data), outlet);
  takeOver(routes, outlet);
};
