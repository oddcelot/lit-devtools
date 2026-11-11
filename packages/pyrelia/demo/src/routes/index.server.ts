import {defineActions, defineLoad, fail} from '@oddsquad/pyrelia/page';
import {href} from '@oddsquad/pyrelia/routes';
import {addNote, allNotes} from '../notes.ts';

export const load = defineLoad(() => ({notes: allNotes()}));

export const actions = defineActions({
  /** Adds a note, then shows it; a note without a title comes back. */
  default: ({body}) => {
    const title = field(body, 'title');
    const text = field(body, 'body');
    if (!title) {
      return fail(400, {error: 'A note needs a title.', title, body: text});
    }
    const note = addNote({title, body: text});
    return new Response(null, {
      status: 303,
      headers: {location: href('/notes/:id', {id: note.id})},
    });
  },
});

/** A posted text field, trimmed; empty when it is missing or a file. */
const field = (body: Record<string, unknown>, name: string) => {
  const value = body[name];
  return typeof value === 'string' ? value.trim() : '';
};
