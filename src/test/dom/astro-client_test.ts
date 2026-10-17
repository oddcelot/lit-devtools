import {afterEach, expect, test} from 'vite-plus/test';
import hydrator from '../../lib/astro/client.js';

/** The registry's own `getName`, taken away to stand for Safari before 17. */
const getName = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(customElements) as object,
  'getName'
);

afterEach(() => {
  if (getName) {
    Object.defineProperty(
      Object.getPrototypeOf(customElements) as object,
      'getName',
      getName
    );
  }
});

class OnlyCard extends HTMLElement {}
customElements.define('only-card', OnlyCard);

test('client:only creates the element where the registry has no getName()', async () => {
  delete (Object.getPrototypeOf(customElements) as {getName?: unknown}).getName;
  const island = document.createElement('astro-island');
  await hydrator(island)(
    OnlyCard,
    {id: 'card'},
    {default: '<p>Body</p>'},
    {client: 'only'}
  );
  const card = island.firstElementChild!;
  expect(card).toBeInstanceOf(OnlyCard);
  expect(card.id).toBe('card');
  expect(card.innerHTML).toBe('<p>Body</p>');
});
