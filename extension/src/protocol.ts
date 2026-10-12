/**
 * Names and shapes shared by the extension's pieces: the page and panel ports
 * the background pairs up, and the runtime messages extension pages send to
 * turn the extension on for a site.
 *
 * Kept free of `chrome` so the background's routing and registration logic,
 * which read these, can be unit-tested with fakes.
 */

/** Port the content script opens, one per top-frame document. */
export const PAGE_PORT = 'lit-page';

/**
 * Port the DevTools panel opens. Its first message is a {@link PanelHello}
 * naming the inspected tab; everything after is a `PortMessage` for the page.
 */
export const PANEL_PORT = 'lit-panel';

export interface PanelHello {
  tabId: number;
}

/**
 * The background's own channel to the panel, in the `PortMessage` shape so a
 * panel can read it off the same port as the page's traffic. Sent when the
 * panel's tab gains or loses its page port: on hello, on every navigation (a
 * new document is a new port) and when the tab closes.
 */
export const CHANNEL_PAGE_STATUS = 'lit-ext:page';

export interface PageStatus {
  connected: boolean;
}

/** Runtime messages an extension page sends the background. */
export type RegistryRequest =
  | {type: 'lit:enable'; origin: string}
  | {type: 'lit:disable'; origin: string}
  | {type: 'lit:status'; origin: string};

/** The background's answer to every {@link RegistryRequest}. */
export interface OriginStatus {
  origin: string;
  /** The content scripts are registered for the origin. */
  enabled: boolean;
  /** The extension holds the origin's host permission. */
  permitted: boolean;
  error?: string;
}

export const isPanelHello = (message: unknown): message is PanelHello =>
  typeof message === 'object' &&
  message !== null &&
  typeof (message as {tabId?: unknown}).tabId === 'number';

export const isRegistryRequest = (
  message: unknown
): message is RegistryRequest => {
  if (typeof message !== 'object' || message === null) return false;
  const {type, origin} = message as {type?: unknown; origin?: unknown};
  return (
    (type === 'lit:enable' ||
      type === 'lit:disable' ||
      type === 'lit:status') &&
    typeof origin === 'string'
  );
};

/**
 * Runtime messages the content script sends the background about the page's
 * saved overrides. The origin is never in the message: the background takes
 * it from the sender, so a page can only reach its own.
 */
export type OverridesRequest =
  | {type: 'lit:overrides-get'}
  | {type: 'lit:overrides-set'; json: string};

export const isOverridesRequest = (
  message: unknown
): message is OverridesRequest => {
  if (typeof message !== 'object' || message === null) return false;
  const {type, json} = message as {type?: unknown; json?: unknown};
  return (
    type === 'lit:overrides-get' ||
    (type === 'lit:overrides-set' && typeof json === 'string')
  );
};
