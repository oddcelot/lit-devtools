import {route} from '@oddsquad/lit-elysia/routes';
import {ordersPage} from '../../orders.ts';
import {rowsQuery} from '../bench.server.ts';

/** The same orders as /bench, for cards styled with UnoCSS. */
export const load = route('/bench/uno', {query: rowsQuery}).load(({query}) =>
  ordersPage(query.rows)
);
