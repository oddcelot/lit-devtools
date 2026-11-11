import {route} from '@oddsquad/pyrelia/routes';

/** Elysia names the wildcard `*`. */
export const load = route('/files/*').load(({params}) => ({
  segments: params['*'].split('/').filter(Boolean),
}));
