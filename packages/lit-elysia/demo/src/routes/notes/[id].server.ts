import {defineLoad, error} from '@oddsquad/lit-elysia/page';
import {findNote} from '../../notes.ts';

export const load = defineLoad(({params}) => {
  const note = findNote(Number(params.id));
  if (!note) throw error(404, 'No such note');
  return note;
});
