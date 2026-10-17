/** The demo's pages, in the order the nav and the home page list them. */
export const pages = [
  {
    href: '/basics/',
    title: 'Server rendering',
    blurb:
      'Declarative shadow roots, hydration, shared sheets, held-back elements.',
  },
  {
    href: '/islands/',
    title: 'Islands',
    blurb: 'Every client: directive, and when each one hydrates.',
  },
  {
    href: '/props/',
    title: 'Props',
    blurb: 'Attributes, properties, and the types that reach the browser.',
  },
  {
    href: '/slots/',
    title: 'Slots',
    blurb: 'Default and named slots, on plain tags and in islands.',
  },
  {
    href: '/nested/',
    title: 'Nested elements',
    blurb: 'Lit elements rendering Lit elements, server-rendered as one.',
  },
  {
    href: '/transitions/',
    title: 'View transitions',
    blurb: 'Swapped pages that still hydrate, and an element that persists.',
  },
  {
    href: '/frameworks/',
    title: 'Next to Preact',
    blurb: 'Lit and Preact islands on one page, and Lit inside Preact.',
  },
  {
    href: '/on-demand/',
    title: 'On demand',
    blurb: 'Rendered for each request by the Node adapter.',
  },
  {
    href: '/devtools/',
    title: 'DevTools and HMR',
    blurb: 'Edit a component and keep its state; inspect it in the toolbar.',
  },
] as const;
