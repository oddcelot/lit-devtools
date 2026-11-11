import {t} from 'elysia';
import {error} from '@oddsquad/pyrelia/page';
import {route} from '@oddsquad/pyrelia/routes';
import {findNote} from '../../notes.ts';

/** `id` arrives as a number; `/notes/abc` is no page at all, a 404. */
const params = t.Object({id: t.Numeric()});

export const load = route('/notes/:id', {params}).load(
  async ({params, query}) => {
    // `?slow` takes its time, to show the progress bar.
    if (query['slow'] !== undefined)
      await new Promise((r) => setTimeout(r, 800));
    const note = findNote(params.id);
    if (!note) throw error(404, 'No such note');
    return note;
  }
);
