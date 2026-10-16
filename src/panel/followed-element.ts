/**
 * The element a host's own inspector has selected, for a view that follows
 * it instead of its own tree. The browser extension's Lit tab in the
 * Elements sidebar publishes the Lit element at or around DevTools' `$0`
 * here, and the details-only Components view shows whatever it names.
 *
 * `null` means the selection is in no element the Components tree lists.
 * A listener that subscribes later hears the latest value at once.
 */

type Listener = (id: number | null) => void;

let latest: {id: number | null} | undefined;
const listeners = new Set<Listener>();

/** Publish the followed element, or `null` for none. */
export const followElement = (id: number | null): void => {
  latest = {id};
  for (const listener of listeners) listener(id);
};

/** Hear each followed element, starting with the latest if there is one. */
export const onFollowedElement = (listener: Listener): (() => void) => {
  listeners.add(listener);
  if (latest !== undefined) listener(latest.id);
  return () => void listeners.delete(listener);
};

/** Forget the latest value; for tests. */
export const resetFollowedElement = (): void => {
  latest = undefined;
};
