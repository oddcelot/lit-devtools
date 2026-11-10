import {defineLoad, error} from '@oddsquad/lit-elysia/page';
import {findNote} from '../../notes.ts';

export const load = defineLoad(async ({params, query}) => {
  // `?slow` takes its time, to show the progress bar.
  if (query['slow'] !== undefined) await new Promise((r) => setTimeout(r, 800));
  const note = findNote(Number(params.id));
  if (!note) throw error(404, 'No such note');
  return note;
});
