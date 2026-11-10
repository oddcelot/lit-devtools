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

/** The router's pending settings, as TanStack's kitchen sink has them. */
export const PENDING_MS_COOKIE = 'pending-ms';
export const PENDING_MIN_MS_COOKIE = 'pending-min-ms';
export const PENDING_DEFAULTS = {ms: 150, minMs: 300};

/** A slider's milliseconds from its cookie: 0 to 5000, or the default. */
export const millisOf = (value: unknown, fallback: number): number => {
  const ms = Number(value);
  return Number.isInteger(ms) && ms >= 0 && ms <= 5000 ? ms : fallback;
};
