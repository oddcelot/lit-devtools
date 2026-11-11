import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import '../components/order-status.ts';

const money = new Intl.NumberFormat('en', {style: 'currency', currency: 'EUR'});
const day = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

const SIZES = [100, 1000, 5000, 10_000];

export default definePage('/bench', {
  title: ({orders}) => `${orders.length.toLocaleString('en')} orders`,
  render: ({orders, byStatus, revenue}) => html`
    <h1>Heavy page</h1>
    <p>
      For benchmarks: every order is a table row with an
      <code>&lt;order-status&gt;</code> component, rendered on the server and
      hydrated, and the rows travel in the page's data too. The same orders as
      JSON, without a page:
      <a href="/api/orders?rows=${orders.length}" data-reload
        ><code>/api/orders?rows=${orders.length}</code></a
      >.
    </p>
    <p class="wa-cluster">
      ${SIZES.map(
        (rows) =>
          html`<a
            href=${href('/bench', {}, {query: {rows}})}
            aria-current=${rows === orders.length ? 'page' : 'false'}
            data-prefetch="off"
            >${rows.toLocaleString('en')} rows</a
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
    <table id="orders">
      <thead>
        <tr>
          <th>#</th>
          <th>Customer</th>
          <th>City</th>
          <th>Product</th>
          <th>Qty</th>
          <th>Total</th>
          <th>Status</th>
          <th>Placed</th>
          <th>Tags</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(
          (order) => html`<tr>
            <td>${order.id}</td>
            <td>${order.customer}<br /><small>${order.email}</small></td>
            <td>${order.city}</td>
            <td>${order.product}</td>
            <td>${order.quantity}</td>
            <td>${money.format(order.total / 100)}</td>
            <td><order-status status=${order.status}></order-status></td>
            <td>${day.format(new Date(order.placedAt))}</td>
            <td>${order.tags.join(', ')}</td>
          </tr>`
        )}
      </tbody>
    </table>
  `,
});
