import {html, nothing} from 'lit';
import {defineLayout, type LoadedData} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {load} from './_layout.server.ts';
import '../../components/note-counter.ts';

const TABS = [
  {label: 'First tab', href: href('/nested')},
  {label: 'Second tab', href: href('/nested/second')},
];

export default defineLayout<LoadedData<typeof load>>({
  title: () => 'Nested layout',
  render: (content, {path, loadedAt}) => html`
    <article class="section">
      <header>
        <strong>A section with a layout of its own</strong>
        <nav aria-label="Section tabs">
          <ul>
            ${TABS.map(
              ({label, href}) =>
                html`<li>
                  <a
                    href=${href}
                    aria-current=${href === path ? 'page' : nothing}
                    >${label}</a
                  >
                </li>`
            )}
          </ul>
        </nav>
      </header>
      ${content}
      <footer>
        <small id="loaded-at"
          >Layout data loaded ${loadedAt.toISOString()}</small
        >
        <note-counter></note-counter>
      </footer>
    </article>
  `,
});
