/**
 * The messages the extension's page runtime and its ISOLATED-world relay
 * trade about saved overrides (see `window-override-storage.ts`). Free of
 * imports, so the relay can take it without the inspector.
 */

/** Marks the relay's override traffic among other `postMessage` traffic. */
export const OVERRIDES_SOURCE = '@oddsquad/vite-plugin-lit#overrides';

export type OverridesWindowMessage =
  | {source: typeof OVERRIDES_SOURCE; type: 'want'}
  | {source: typeof OVERRIDES_SOURCE; type: 'seed'; json: string | null}
  | {source: typeof OVERRIDES_SOURCE; type: 'save'; json: string};

/** The message in `event`, if it is override traffic from this window. */
export const overridesMessageOf = (
  event: MessageEvent,
  target: Window
): OverridesWindowMessage | undefined => {
  if (event.source !== target) return undefined;
  const data = event.data as Partial<OverridesWindowMessage> | null;
  return data?.source === OVERRIDES_SOURCE
    ? (data as OverridesWindowMessage)
    : undefined;
};
