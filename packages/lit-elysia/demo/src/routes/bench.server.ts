import {t} from 'elysia';
import {route} from '@oddsquad/lit-elysia/routes';
import {firstOrders, MAX_ORDERS, ORDER_STATUSES} from '../orders.ts';

const query = t.Object({
  rows: t.Optional(t.Numeric({minimum: 1, maximum: MAX_ORDERS})),
});

/**
 * A heavy page for benchmarks: `?rows=` orders, 1,000 unless asked, each a
 * table row with a component in it, and totals worked out on the server.
 */
export const load = route('/bench', {query}).load(({query}) => {
  const orders = firstOrders(query.rows ?? 1000);
  const byStatus = Object.fromEntries(
    ORDER_STATUSES.map((status) => [
      status,
      orders.filter((order) => order.status === status).length,
    ])
  ) as Record<(typeof ORDER_STATUSES)[number], number>;
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  return {orders, byStatus, revenue};
});
