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
