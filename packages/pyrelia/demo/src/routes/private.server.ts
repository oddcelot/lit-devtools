import {route} from '@oddsquad/pyrelia/routes';

/** Only reached past the guard in src/server.ts, so `visitor` is set. */
export const load = route('/private').load(({visitor}) => ({
  visitor: visitor!,
}));
