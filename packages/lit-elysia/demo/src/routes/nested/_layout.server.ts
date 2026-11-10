import {defineLoad} from '@oddsquad/lit-elysia/page';

/** Loaded again on each navigation inside the section, like every layout. */
export const load = defineLoad(({request}) => ({
  path: new URL(request.url).pathname,
  loadedAt: new Date(),
}));
