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
      {label: 'All notes', href: '/'},
      {label: 'A note', href: '/notes/1'},
      {label: 'Newest note', href: '/latest'},
    ],
  },
  {
    title: 'Params',
    links: [
      {label: 'Two params', href: '/params/red/round'},
      {label: 'Catch-all', href: '/files/docs/guide/routing.md'},
      {label: 'Query string', href: '/search?q=the'},
    ],
  },
  {
    title: 'Layouts',
    links: [
      {label: 'Nested layout', href: '/nested'},
      {label: 'Its second tab', href: '/nested/second'},
    ],
  },
  {
    title: 'Forms',
    links: [
      {label: 'Add a note', href: '/#add'},
      {label: 'Named actions', href: '/actions'},
    ],
  },
  {
    title: 'Data',
    links: [
      {label: 'Deferred data', href: '/deferred'},
      {label: 'A slow note', href: '/notes/1?slow'},
    ],
  },
  {
    title: 'Navigation',
    links: [
      {label: 'First note, as a full load', href: '/notes/1', reload: true},
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
      {label: "A note that isn't there", href: '/notes/99'},
      {label: "A page that doesn't exist", href: '/nowhere'},
      {label: 'A page that fails', href: '/broken'},
    ],
  },
];
