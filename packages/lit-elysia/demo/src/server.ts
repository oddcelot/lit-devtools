import {Elysia, t} from 'elysia';
import {addNote, allNotes} from './notes.ts';

/** The app the pages are added to: here, a small JSON API. */
export default new Elysia({prefix: '/api'})
  .get('/notes', () => allNotes())
  .post(
    '/notes',
    {body: t.Object({title: t.String(), body: t.String()})},
    ({body}) => addNote(body)
  );

/**
 * The pages' own context: every load and action gets `site` and `visitor`,
 * typed, and the guard runs before them.
 */
export const context = new Elysia({name: 'demo/context'})
  .decorate('site', {name: 'Notes'})
  .derive(({cookie}) => {
    const value = cookie['visitor']?.value;
    return {visitor: typeof value === 'string' && value ? value : undefined};
  })
  .onBeforeHandle(({request, cookie, redirect}) => {
    const {pathname} = new URL(request.url);
    if (pathname === '/private' && !cookie['visitor']?.value) {
      return redirect('/visitor?from=private', 303);
    }
  });
