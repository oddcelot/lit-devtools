import {defineLoad} from '@oddsquad/lit-elysia/page';

/** Runs on every navigation, so `path` names the page on screen. */
export const load = defineLoad(({site, request}) => ({
  site: site.name,
  path: new URL(request.url).pathname,
}));
