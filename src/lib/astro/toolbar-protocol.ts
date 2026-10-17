/**
 * What the Astro integration (`astro.ts`) and its dev toolbar app
 * (`toolbar-app.ts`) say to each other over Astro's toolbar messages. The app
 * sends `<id>:auth-request` once it starts; the server answers `<id>:auth`.
 */

/** The toolbar app's id, and the prefix of its messages. */
export const ASTRO_TOOLBAR_APP_ID = 'lit-devtools';

export interface AstroToolbarAuth {
  /** Whether the panel's RPC asks for devframe's one-time code. */
  required: boolean;
}
