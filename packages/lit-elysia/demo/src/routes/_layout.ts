import {html, nothing} from 'lit';
import {defineLayout, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './_layout.server.ts';
import {MENU, type MenuLink} from './_menu.ts';
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

export default defineLayout<LoadedData<typeof load>>({
  title: () => 'Notes',
  head: () => html`<meta name="theme-color" content="#324fff" />`,
  render: (content, {count, path}) => html`
    <header class="container">
      <nav>
        <ul>
          <li>
            <strong><a href="/">Notes</a></strong>
          </li>
        </ul>
        <ul>
          <li><small id="note-count">${count} notes</small></li>
          <li><layout-clicks></layout-clicks></li>
        </ul>
      </nav>
    </header>
    <div class="container app">
      <aside>
        <nav aria-label="Routing demos">
          ${MENU.map(
            ({title, links}) => html`
              <small>${title}</small>
              <ul>
                ${links.map((entry) => link(entry, path))}
              </ul>
            `
          )}
        </nav>
      </aside>
      <main>${content}</main>
    </div>
  `,
});
