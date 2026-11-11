import {html} from 'lit';
import {definePage} from '@oddsquad/pyrelia/page';
import {href} from '@oddsquad/pyrelia/routes';
import '../../components/uno/order-card.ts';

const money = new Intl.NumberFormat('en', {style: 'currency', currency: 'EUR'});

const SIZES = [100, 1000, 5000, 10_000];

export default definePage('/bench/uno', {
  // As /bench: the cards go out once, as HTML, and hydrate from their
  // attributes.
  hydrate: false,
  title: ({orders}) => `${orders.length.toLocaleString('en')} cards (UnoCSS)`,
  render: ({orders, byStatus, revenue}) => html`
    <h1>Heavy page, UnoCSS</h1>
    <p>
      The orders of <a href=${href('/bench')}>the heavy page</a>, each an
      <code>&lt;order-card&gt;</code> styled with UnoCSS utilities alone. Every
      card's shadow root adopts the one sheet <code>unoSheet()</code> writes; in
      a build, the server sends each a line that imports it.
    </p>
    <p class="wa-cluster">
      ${SIZES.map(
        (rows) =>
          html`<a
            href=${href('/bench/uno', {}, {query: {rows}})}
            aria-current=${rows === orders.length ? 'page' : 'false'}
            data-prefetch="off"
            >${rows.toLocaleString('en')} cards</a
          >`
      )}
    </p>
    <p id="bench-summary">
      ${orders.length.toLocaleString('en')} orders,
      ${money.format(revenue / 100)}:
      ${Object.entries(byStatus)
        .map(([status, count]) => `${count} ${status}`)
        .join(', ')}.
    </p>
    <div id="cards" class="wa-stack wa-gap-2xs">
      ${orders.map(
        (order) =>
          html`<order-card
            order-id=${order.id}
            customer=${order.customer}
            email=${order.email}
            city=${order.city}
            product=${order.product}
            quantity=${order.quantity}
            total=${order.total}
            status=${order.status}
            placed=${order.placedAt}
            tags=${order.tags.join(',')}
          ></order-card>`
      )}
    </div>
  `,
});
