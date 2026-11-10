import {defineLoad} from '@oddsquad/lit-elysia/page';
import {allNotes} from '../notes.ts';

/**
 * Runs on every navigation, the router's too, so `path` always names the
 * page on screen and the sidebar can mark it.
 */
export const load = defineLoad(({request}) => {
  const url = new URL(request.url);
  return {count: allNotes().length, path: url.pathname + url.search};
});
