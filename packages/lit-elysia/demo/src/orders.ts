/**
 * Made-up orders, for a page heavy enough to benchmark: the same rows on
 * every server and every run, from a seeded generator, so numbers taken on
 * Node, Bun and Workers compare the same work.
 */

export const ORDER_STATUSES = [
  'paid',
  'pending',
  'shipped',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: number;
  customer: string;
  email: string;
  city: string;
  product: string;
  quantity: number;
  /** In cents. */
  total: number;
  status: OrderStatus;
  /** ISO 8601. */
  placedAt: string;
  tags: string[];
}

/** The most rows the page and the API give out. */
export const MAX_ORDERS = 10_000;

const FIRST = [
  'Ada',
  'Grace',
  'Linus',
  'Margaret',
  'Ken',
  'Barbara',
  'Alan',
  'Radia',
  'Dennis',
  'Frances',
  'Edsger',
  'Hedy',
];
const LAST = [
  'Lovelace',
  'Hopper',
  'Torvalds',
  'Hamilton',
  'Thompson',
  'Liskov',
  'Turing',
  'Perlman',
  'Ritchie',
  'Allen',
  'Dijkstra',
  'Lamarr',
];
const CITIES = [
  'Vienna',
  'Lisbon',
  'Osaka',
  'Toronto',
  'Nairobi',
  'Oslo',
  'Lima',
  'Hanoi',
  'Austin',
  'Kraków',
];
const PRODUCTS = [
  'Keyboard',
  'Monitor',
  'Desk lamp',
  'Headphones',
  'Webcam',
  'Standing desk',
  'Mouse',
  'USB hub',
];
const TAGS = ['gift', 'express', 'b2b', 'returning', 'bulk', 'priority'];

/** mulberry32: small, fast, and the same sequence everywhere. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const generate = (): Order[] => {
  const next = random(42);
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(next() * list.length)]!;
  const start = Date.UTC(2026, 0, 1);
  return Array.from({length: MAX_ORDERS}, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    const quantity = 1 + Math.floor(next() * 5);
    return {
      id: i + 1,
      customer: `${first} ${last}`,
      email: `${first}.${last}${i}@example.com`.toLowerCase(),
      city: pick(CITIES),
      product: pick(PRODUCTS),
      quantity,
      total: quantity * (999 + Math.floor(next() * 40_000)),
      status: pick(ORDER_STATUSES),
      placedAt: new Date(
        start + Math.floor(next() * 300 * 86_400_000)
      ).toISOString(),
      tags: TAGS.filter(() => next() < 0.2),
    };
  });
};

// Made once, on first use: a benchmark measures rendering, not this.
let orders: Order[] | undefined;

/** The first `count` orders. */
export const firstOrders = (count: number): Order[] =>
  (orders ??= generate()).slice(0, count);

/**
 * What the benchmark pages load: `rows` orders, 1,000 unless asked, and
 * totals worked out on the server.
 */
export const ordersPage = (rows = 1000) => {
  const orders = firstOrders(rows);
  const byStatus = Object.fromEntries(
    ORDER_STATUSES.map((status) => [
      status,
      orders.filter((order) => order.status === status).length,
    ])
  ) as Record<OrderStatus, number>;
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  return {orders, byStatus, revenue};
};
