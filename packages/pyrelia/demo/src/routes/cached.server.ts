import {defineLoad} from '@oddsquad/pyrelia/page';
import {allNotes} from '../notes.ts';

/**
 * Cached by the browser for ten seconds, and loaded again by
 * `invalidate('clock')` or after a form changes data.
 */
export const load = defineLoad(({setHeaders, depends}) => {
  setHeaders({'cache-control': 'private, max-age=10'});
  depends('clock');
  return {renderedAt: new Date(), notes: allNotes().length};
});
