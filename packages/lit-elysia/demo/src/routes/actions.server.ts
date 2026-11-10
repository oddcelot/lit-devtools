import {defineActions, defineLoad, fail} from '@oddsquad/lit-elysia/page';

let count = 0;

export const load = defineLoad(() => ({count}));

/** Picked by `action="?/name"`. */
export const actions = defineActions({
  increment: () => {
    count++;
    return {done: 'Added one.'};
  },
  reset: () => {
    if (count === 0) return fail(409, {done: 'Already at zero.'});
    count = 0;
    return {done: 'Back to zero.'};
  },
});
