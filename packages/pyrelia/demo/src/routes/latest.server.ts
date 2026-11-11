import {defineLoad} from '@oddsquad/pyrelia/page';
import {href} from '@oddsquad/pyrelia/routes';
import {allNotes} from '../notes.ts';

/** Always a redirect, to the newest note. */
export const load = defineLoad(
  () =>
    new Response(null, {
      status: 302,
      headers: {location: href('/notes/:id', {id: allNotes().at(-1)!.id})},
    })
);
