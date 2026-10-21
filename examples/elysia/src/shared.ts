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

/** What the server renders the page from, and what the page hydrates with. */
export interface PageData {
  entries: Entry[];
  /** Pages connected to `/live` when this one was rendered. */
  online: number;
  /** Set when a form post without JavaScript failed validation. */
  error?: string;
}

/** Everything `/live` sends. */
export type LiveMessage =
  | {type: 'entry'; entry: Entry}
  | {type: 'online'; count: number};

export const LIMITS = {name: 40, message: 280} as const;
