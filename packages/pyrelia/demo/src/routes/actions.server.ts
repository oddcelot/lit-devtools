import {defineActions, defineLoad, fail} from '@oddsquad/pyrelia/page';

let count = 0;

export const load = defineLoad(() => ({count}));

/** The step both buttons post, a whole number from 1 to 100. */
const stepOf = (body: Record<string, unknown>) => {
  const step = Number(body['step']);
  return Number.isInteger(step) && step >= 1 && step <= 100 ? step : undefined;
};

/**
 * Picked by the button's `formaction="?/name"`. Add and Subtract read the
 * same field from the one form; Reset ignores it.
 */
export const actions = defineActions({
  add: ({body}) => {
    const step = stepOf(body);
    if (!step)
      return fail(400, {done: 'The step is a whole number, 1 to 100.'});
    count += step;
    return {done: `Added ${step}.`, step};
  },
  subtract: ({body}) => {
    const step = stepOf(body);
    if (!step)
      return fail(400, {done: 'The step is a whole number, 1 to 100.'});
    count -= step;
    return {done: `Subtracted ${step}.`, step};
  },
  reset: () => {
    if (count === 0) return fail(409, {done: 'Already at zero.'});
    count = 0;
    return {done: 'Back to zero.'};
  },
});
