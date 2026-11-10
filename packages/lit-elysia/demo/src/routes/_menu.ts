import {href} from '@oddsquad/lit-elysia/routes';

/** One entry in the sidebar. */
export interface MenuLink {
  label: string;
  href: string;
  /** A full page load, past the router. */
  reload?: boolean;
  /** Another site: the router leaves it to the browser. */
  external?: boolean;
}

/** The sidebar: one demo of each routing feature. */
export const MENU: {title: string; links: MenuLink[]}[] = [
  {
    title: 'Pages',
    links: [
      {label: 'All notes', href: href('/')},
      {label: 'A note', href: href('/notes/:id', {id: 1})},
      {label: 'Newest note', href: href('/latest')},
    ],
  },
  {
    title: 'Params',
    links: [
      {
        label: 'Two params',
        href: href('/params/:a/:b', {a: 'red', b: 'round'}),
      },
      {
        label: 'Catch-all',
        href: href('/files/*', {'*': 'docs/guide/routing.md'}),
      },
      {label: 'Query string', href: href('/search', {}, {query: {q: 'the'}})},
    ],
  },
  {
    title: 'Layouts',
    links: [
      {label: 'Nested layout', href: href('/nested')},
      {label: 'Its second tab', href: href('/nested/second')},
    ],
  },
  {
    title: 'Forms',
    links: [
      {label: 'Add a note', href: href('/', {}, {hash: 'add'})},
      {label: 'Named actions', href: href('/actions')},
    ],
  },
  {
    title: 'Data',
    links: [
      {label: 'Deferred data', href: href('/deferred')},
      {label: 'Cached for 10 seconds', href: href('/cached')},
      {
        label: 'A slow note',
        href: href('/notes/:id', {id: 1}, {query: {slow: ''}}),
      },
    ],
  },
  {
    title: 'Navigation',
    links: [
      {
        label: 'First note, as a full load',
        href: href('/notes/:id', {id: 1}),
        reload: true,
      },
      {
        label: 'Elysia (another site)',
        href: 'https://elysiajs.com',
        external: true,
      },
    ],
  },
  {
    title: 'Errors',
    links: [
      {label: "A note that isn't there", href: href('/notes/:id', {id: 99})},
      {label: "A page that doesn't exist", href: '/nowhere'},
      {label: 'A page that fails', href: href('/broken')},
    ],
  },
];
