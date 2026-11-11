import {defineLoad} from '@oddsquad/pyrelia/page';

/** Fails on purpose, to show the error page. */
export const load = defineLoad((): never => {
  throw new Error('The database is on fire');
});
