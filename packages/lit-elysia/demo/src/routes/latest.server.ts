import {defineLoad} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import {allNotes} from '../notes.ts';

/** Always a redirect, to the newest note. */
export const load = defineLoad(
  () =>
    new Response(null, {
      status: 302,
      headers: {location: href('/notes/:id', {id: allNotes().at(-1)!.id})},
    })
);
