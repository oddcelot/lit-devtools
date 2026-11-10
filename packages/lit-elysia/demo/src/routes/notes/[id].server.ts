import {error} from '@oddsquad/lit-elysia/page';
import {route} from '@oddsquad/lit-elysia/routes';
import {findNote} from '../../notes.ts';

export const load = route('/notes/:id').load(async ({params, query}) => {
  // `?slow` takes its time, to show the progress bar.
  if (query['slow'] !== undefined) await new Promise((r) => setTimeout(r, 800));
  const note = findNote(Number(params.id));
  if (!note) throw error(404, 'No such note');
  return note;
});
