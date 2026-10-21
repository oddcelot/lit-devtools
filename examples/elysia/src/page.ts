import {html} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import './components/guest-book.ts';
import type {Connection} from './components/live-status.ts';
import './components/live-status.ts';
import './components/sign-form.ts';
import type {PageData} from './shared.ts';

/**
 * What the page renders from. The server knows `PageData`; the rest only
 * exists in the browser, and stays unset until hydration is done.
 */
export interface PageView extends PageData {
  now?: number;
  fresh?: readonly number[];
  connection?: Connection;
}

/**
 * The page's regions, each rendered into its own element. The server renders
 * all of them; the client hydrates the `live` ones with the same data and
 * renders them again whenever the data changes.
 *
 * `sign` is left alone. Hydrating a template takes `defer-hydration` off
 * every custom element in it, so an element that should wait for the reader
 * has to sit outside any template the client hydrates.
 */
export const regions = {
  live: {
    masthead: (view: PageView) => html`
      <div>
        <h1>Guestbook</h1>
        <p>Lit components, server-rendered by Elysia on Bun.</p>
      </div>
      <live-status
        online=${view.online}
        connection=${view.connection ?? 'connecting'}
      ></live-status>
    `,
    book: (view: PageView) => html`
      <guest-book
        .entries=${view.entries}
        .now=${view.now}
        .fresh=${view.fresh ?? []}
      ></guest-book>
    `,
  },
  sign: (view: PageView) => html`
    <sign-form defer-hydration error=${ifDefined(view.error)}></sign-form>
  `,
};
