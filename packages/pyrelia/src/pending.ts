/** When a navigation counts as pending, and for how long it then shows. */
export interface PendingOptions {
  /**
   * How long a navigation waits on the server before the page is marked
   * busy: quicker ones never show it, so nothing flashes. Default 150.
   */
  ms: number;
  /**
   * Once marked busy, how long it stays so at least, so it doesn't blink
   * off the moment it appeared. Default 300.
   */
  minMs: number;
}

const pending: PendingOptions = {ms: 150, minMs: 300};

export const pendingOptions = (): Readonly<PendingOptions> => pending;

/**
 * Changes when the router marks the page busy, from the next navigation on:
 * `configurePending({ms: 500, minMs: 1000})`. The plugin's `pending`
 * option sets the starting values.
 */
export const configurePending = (options: Partial<PendingOptions>): void => {
  Object.assign(pending, options);
};
