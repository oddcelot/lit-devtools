/**
 * Slots through Astro, in islands and out. The renderer puts the children
 * in the element's light DOM as written, the named ones with their `slot`
 * back, rather than in `<astro-slot>` wrappers, which would become the one
 * slotted child and hide each `slot` attribute. Astro then keeps a copy of
 * each slot in an inert `<template data-astro-template>`, which a
 * server-rendered island drops as it hydrates, and from which a
 * `client:only` island builds its children.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type AstroFixture, startAstroFixture} from './astro-utils.js';

const CARD = `import {LitElement, html} from 'lit';

export class SlotCard extends LitElement {
  override render() {
    return html\`<header><slot name="title"></slot></header><slot></slot>\`;
  }
}
customElements.define('slot-card', SlotCard);
`;

const card = (id: string, directive = '') =>
  `<SlotCard id="${id}" ${directive}>
      <h2 slot="title">Title ${id}</h2>
      <p>First ${id}</p>
      Loose text
      <p>Second ${id}</p>
    </SlotCard>`;

const PAGE = `---
import {SlotCard} from '../slots/slot-card.ts';
---

<html lang="en">
  <head>
    <title>Slots</title>
    <link rel="icon" href="/favicon.svg" />
  </head>
  <body>
    ${card('plain')}
    ${card('load', 'client:load')}
    ${card('only', 'client:only="lit"')}
    <script>
      import '../slots/slot-card.ts';
    </script>
  </body>
</html>
`;

let fixture: AstroFixture;

beforeAll(async () => {
  fixture = await startAstroFixture({
    files: {
      'src/slots/slot-card.ts': CARD,
      'src/pages/slots.astro': PAGE,
    },
  });
});

afterAll(async () => {
  await fixture?.close();
});

/** What each of the card's slots shows, by slot name. */
const assigned = (id: string) =>
  fixture.page.evaluate(
    `(() => {
      const card = document.getElementById(${JSON.stringify(id)});
      if (!card?.shadowRoot) return null;
      const text = (slot) =>
        slot.assignedNodes()
          .map((n) => n.textContent.trim())
          .filter((t) => t !== '');
      return {
        title: text(card.shadowRoot.querySelector('slot[name=title]')),
        default: text(card.shadowRoot.querySelector('slot:not([name])')),
        templates: card.closest('astro-island')?.querySelectorAll('template[data-astro-template]').length ?? 0,
        children: card.children.length,
      };
    })()`
  );

test('the default and named slots show their content, once, in and out of islands', async () => {
  const {page} = fixture;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${fixture.origin}/slots`);
  for (const id of ['plain', 'load', 'only']) {
    await expect
      .poll(() => assigned(id))
      .toEqual({
        title: [`Title ${id}`],
        default: [`First ${id}`, 'Loose text', `Second ${id}`],
        templates: 0,
        children: 3,
      });
  }
  expect(errors).toEqual([]);
});
