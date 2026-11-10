import {defineLoad} from '@oddsquad/lit-elysia/page';
import {allNotes} from '../notes.ts';

/** Always a redirect, to the newest note. */
export const load = defineLoad(
  () =>
    new Response(null, {
      status: 302,
      headers: {location: `/notes/${allNotes().at(-1)!.id}`},
    })
);
