import {route} from '@oddsquad/lit-elysia/routes';

/** Elysia names the wildcard `*`. */
export const load = route('/files/*').load(({params}) => ({
  segments: params['*'].split('/').filter(Boolean),
}));
