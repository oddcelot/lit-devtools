import {defineLoad} from '@oddsquad/lit-elysia/page';

/** Elysia names the wildcard `*`. */
export const load = defineLoad(({params}) => ({
  segments: (params['*'] ?? '').split('/').filter(Boolean),
}));
