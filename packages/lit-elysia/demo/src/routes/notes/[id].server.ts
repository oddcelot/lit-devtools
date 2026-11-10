import {defineLoad} from '@oddsquad/lit-elysia/page';
import {findNote} from '../../notes.ts';

export const load = defineLoad(({params}) => {
  const note = findNote(Number(params.id));
  return note ?? new Response('No such note', {status: 404});
});
