import {html, nothing} from 'lit';
import {defineLayout, type LoadedData} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {load} from './_layout.server.ts';
import {MENU, type MenuLink} from './_menu.ts';
import '@awesome.me/webawesome/dist/components/page/page.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '../components/layout-clicks.ts';

const link = ({label, href, reload, external}: MenuLink, path: string) =>
  html`<li>
    <a
      href=${href}
      aria-current=${href === path && !reload ? 'page' : nothing}
      ?data-reload=${reload}
      rel=${external ? 'external' : nothing}
      >${label}</a
    >
  </li>`;

/**
 * Three bars, inline: wa-page's own toggle icon comes from Font Awesome's
 * CDN, which neither the CSP nor an offline dev server would allow. In a
 * span: wa-page makes what fills the slot a flex box, and an <svg> that is
 * one paints nothing.
 */
const bars = html`<span slot="navigation-toggle-icon"
  ><svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    fill="currentColor"
  >
    <rect y="2" width="16" height="2" rx="1" />
    <rect y="7" width="16" height="2" rx="1" />
    <rect y="12" width="16" height="2" rx="1" /></svg
></span>`;

/** On mobile the menu is a drawer: following one of its links closes it. */
const closeDrawer = (event: Event) => {
  const link = (event.target as Element).closest('a');
  const page = (event.currentTarget as Element).closest('wa-page');
  if (link && page) page.hideNavigation();
};

export default defineLayout<LoadedData<typeof load>>({
  title: () => 'Notes',
  head: () => html`<meta name="theme-color" content="#324fff" />`,
  render: (content, {count, path}) => html`
    <wa-page mobile-breakpoint="768">
      <header slot="header" class="site-header">
        <a class="brand" href=${href('/')}>Notes</a>
        <div class="wa-cluster wa-gap-s">
          <wa-badge variant="neutral" pill id="note-count"
            >${count} notes</wa-badge
          >
          <layout-clicks></layout-clicks>
        </div>
      </header>
      ${bars}
      <nav
        slot="navigation"
        id="menu"
        aria-label="Routing demos"
        @click=${closeDrawer}
      >
        ${MENU.map(
          ({title, links}) => html`
            <h2>${title}</h2>
            <ul>
              ${links.map((entry) => link(entry, path))}
            </ul>
          `
        )}
      </nav>
      <div id="content">${content}</div>
    </wa-page>
  `,
});
