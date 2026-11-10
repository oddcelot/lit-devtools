import {defineLoad} from '@oddsquad/lit-elysia/page';
import {allNotes} from '../notes.ts';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `renderedAt` blocks, like any value; the promises don't. The page goes out
 * with placeholders, and each value follows in the same response.
 */
export const load = defineLoad(() => ({
  renderedAt: new Date(),
  count: wait(1200).then(() => ({notes: allNotes().length, at: new Date()})),
  tags: wait(2000).then(() => ['Elysia', 'Lit', 'seroval']),
  broken: wait(600).then((): string => {
    throw new Error('The cache is on fire');
  }),
}));
