/**
 * How the current page arrived, for the demo's elements to report. The
 * layout loads this with the first page, so it hears every view transition
 * that follows; an element's own module may first load after one.
 */
export const navigation = {
  /** Whether a view transition swapped the current page in. */
  swapped: false,
  /** When the current page arrived: 0 for the load, else the swap. */
  arrivedAt: 0,
};

// Before the swap: elements of the incoming page connect, and hydrate,
// while it happens. The module loads on the server too, without a document.
globalThis.document?.addEventListener('astro:before-swap', () => {
  navigation.swapped = true;
  navigation.arrivedAt = performance.now();
});
