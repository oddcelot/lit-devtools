import {t} from 'elysia';
import {route} from '@oddsquad/lit-elysia/routes';
import {allNotes} from '../notes.ts';

/**
 * The query, checked and coerced before the load runs: `limit` arrives as
 * a number, and `?limit=many` answers 400. Links to the page are typed by
 * it too.
 */
const query = t.Object({
  q: t.Optional(t.String()),
  limit: t.Optional(t.Numeric({minimum: 1})),
});

export const load = route('/search', {query}).load(({query}) => {
  const q = (query.q ?? '').trim();
  const needle = q.toLowerCase();
  const matches = allNotes().filter((note) =>
    `${note.title} ${note.body}`.toLowerCase().includes(needle)
  );
  return {q, results: matches.slice(0, query.limit)};
});
