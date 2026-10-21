import {html, nothing, type TemplateResult} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import './components/guest-book.ts';
import './components/guest-entry.ts';
import type {Connection} from './components/live-status.ts';
import './components/live-status.ts';
import './components/sign-form.ts';
import type {BookData, EntryData, PageData} from './shared.ts';

/** What only the browser knows; unset until hydration is done. */
interface ClientState {
  now?: number;
  fresh?: readonly number[];
  connection?: Connection;
}

type BookView = BookData & ClientState;
type EntryView = EntryData & ClientState;
/** What a page renders from: the server's data, then the browser's too. */
export type PageView = PageData & ClientState;

/** One part of a page, rendered into its own element. */
export interface Region<V extends PageView = PageView> {
  tag: 'header' | 'section';
  id: string;
  /**
   * Whether the client hydrates the region and renders it again on every
   * change. Hydrating a template takes `defer-hydration` off every custom
   * element in it, so an element that should wait for the reader has to sit
   * in a region that is not hydrated.
   */
  hydrate: boolean;
  render(view: V): TemplateResult;
}

const masthead: Region = {
  tag: 'header',
  id: 'masthead',
  hydrate: true,
  render: (view) => html`
    <div>
      <h1><a href="/">Guestbook</a></h1>
      <p>Lit components, server-rendered by Elysia on Bun.</p>
    </div>
    <live-status
      online=${view.online}
      connection=${view.connection ?? 'connecting'}
    ></live-status>
  `,
};

const book: Region<BookView>[] = [
  masthead,
  {
    tag: 'section',
    id: 'sign',
    hydrate: false,
    render: (view) => html`
      <sign-form defer-hydration error=${ifDefined(view.error)}></sign-form>
    `,
  },
  {
    tag: 'section',
    id: 'book',
    hydrate: true,
    render: (view) => html`
      <guest-book
        .entries=${view.entries}
        .now=${view.now}
        .fresh=${view.fresh ?? []}
      ></guest-book>
    `,
  },
];

const entry: Region<EntryView>[] = [
  masthead,
  {
    tag: 'section',
    id: 'entry',
    hydrate: true,
    render: (view) => html`
      <nav class="crumbs"><a href="/">← All signatures</a></nav>
      <guest-entry .entry=${view.entry} .now=${view.now}></guest-entry>
      <nav class="pager">
        ${
          view.olderId === undefined
            ? nothing
            : html`<a rel="prev" href="/entries/${view.olderId}">← Older</a>`
        }
        ${
          view.newerId === undefined
            ? nothing
            : html`<a rel="next" href="/entries/${view.newerId}">Newer →</a>`
        }
      </nav>
    `,
  },
];

/**
 * A page's regions, in order. One list for both sides: the server renders
 * every region, the client hydrates the ones marked `hydrate` with the same
 * data and renders them again whenever the data changes.
 */
export const regionsOf = (view: PageView): Region[] =>
  // Each list only ever meets views of its own page, which the `page` field
  // picks; TypeScript cannot follow a function's parameter through that.
  (view.page === 'book' ? book : entry) as Region[];

/** The document title for a page. */
export const titleOf = (data: PageData): string =>
  data.page === 'book'
    ? 'Guestbook · Lit on Elysia'
    : `${data.entry.name} · Guestbook`;
