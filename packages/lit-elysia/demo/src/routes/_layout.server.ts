import {defineLoad} from '@oddsquad/lit-elysia/page';
import {allNotes} from '../notes.ts';

/**
 * Runs on every navigation, the router's too, so `path` always names the
 * page on screen and the sidebar can mark it.
 */
export const load = defineLoad(({request}) => {
  const url = new URL(request.url);
  // A form post answers at its action, `?/name`: the page is its path.
  const search = request.method === 'GET' ? url.search : '';
  return {count: allNotes().length, path: url.pathname + search};
});
