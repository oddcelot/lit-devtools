/**
 * Simulated network latency, as in TanStack Router's kitchen sink: the
 * header sets a cookie, and the server waits that long before every page's
 * loads, documents and router fetches alike.
 */
export const SPEEDS = [
  {label: 'Instant', ms: 0},
  {label: 'Fast', ms: 150},
  {label: 'Fast 3G', ms: 500},
  {label: 'Slow 3G', ms: 2000},
] as const;

export const LATENCY_COOKIE = 'latency';

/** One of the speeds' delays, or none: a cookie can't ask for any other. */
export const latencyOf = (value: unknown): number => {
  const ms = Number(value);
  return SPEEDS.some((speed) => speed.ms === ms) ? ms : 0;
};
