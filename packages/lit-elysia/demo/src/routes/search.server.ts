import {defineLoad} from '@oddsquad/lit-elysia/page';
import {allNotes} from '../notes.ts';

export const load = defineLoad(({query}) => {
  const q = (query['q'] ?? '').trim();
  const needle = q.toLowerCase();
  return {
    q,
    results: allNotes().filter((note) =>
      `${note.title} ${note.body}`.toLowerCase().includes(needle)
    ),
  };
});
