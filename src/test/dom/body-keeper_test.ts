import {expect, test} from 'vite-plus/test';
import {keepInBody} from '../../lib/runtime/body-keeper.js';

/** Swaps in a new `<body>`, as Turbo Drive does on a visit. */
const swapBody = (): HTMLElement => {
  const next = document.createElement('body');
  document.documentElement.replaceChild(next, document.body);
  return next;
};

test('an element kept in the body follows the page into a swapped-in one', async () => {
  const el = document.createElement('div');
  keepInBody(el);
  expect(el.parentNode).toBe(document.body);
  const next = swapBody();
  // Mutation records arrive in a microtask.
  await Promise.resolve();
  expect(el.parentNode).toBe(next);
});
