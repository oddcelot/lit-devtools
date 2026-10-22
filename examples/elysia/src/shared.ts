/**
 * Types the server and the page both use. Nothing here may import from
 * `bun:*` or Elysia's runtime, since the client bundle includes this file.
 */

export interface Entry {
  id: number;
  name: string;
  message: string;
  /** ISO 8601, UTC. */
  createdAt: string;
}

/**
 * What the server renders a page from, and what the page hydrates with.
 * `page` says which page it is; the client reads it to know which regions
 * to hydrate.
 */
export type PageData = BookData | EntryData;

interface CommonData {
  /** Pages connected to `/live` when this one was rendered. */
  online: number;
}

/** `/`: every signature, and the form. */
export interface BookData extends CommonData {
  page: 'book';
  entries: Entry[];
  /** Set when a form post without JavaScript failed validation. */
  error?: string;
}

/** `/entries/:id`: one signature, with links to its neighbours. */
export interface EntryData extends CommonData {
  page: 'entry';
  entry: Entry;
  /** The next signature back, if any. */
  olderId?: number;
  /** The next signature on, if any. */
  newerId?: number;
}

/** Everything `/live` sends. */
export type LiveMessage =
  | {type: 'entry'; entry: Entry}
  | {type: 'online'; count: number};

export const LIMITS = {name: 40, message: 280} as const;
