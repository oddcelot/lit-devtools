import {t} from 'elysia';
import {route} from '@oddsquad/lit-elysia/routes';
import {MAX_ORDERS, ordersPage} from '../orders.ts';

/** `?rows=`, 1 to 10,000; the UnoCSS page takes the same. */
export const rowsQuery = t.Object({
  rows: t.Optional(t.Numeric({minimum: 1, maximum: MAX_ORDERS})),
});

/**
 * A heavy page for benchmarks: `?rows=` orders, 1,000 unless asked, each a
 * table row with a component in it, and totals worked out on the server.
 */
export const load = route('/bench', {query: rowsQuery}).load(({query}) =>
  ordersPage(query.rows)
);
