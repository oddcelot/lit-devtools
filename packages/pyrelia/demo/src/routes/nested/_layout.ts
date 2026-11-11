import {html, nothing} from 'lit';
import {defineLayout} from '@oddsquad/pyrelia/page';
import {href} from '@oddsquad/pyrelia/routes';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '../../components/note-counter.ts';

const TABS = [
  {label: 'First tab', href: href('/nested')},
  {label: 'Second tab', href: href('/nested/second')},
];

export default defineLayout('/nested', {
  title: () => 'Nested layout',
  render: (content, {path, loadedAt}) => html`
    <wa-card class="section">
      <div slot="header" class="wa-stack wa-gap-xs">
        <strong>A section with a layout of its own</strong>
        <nav aria-label="Section tabs" class="tabs wa-cluster">
          ${TABS.map(
            ({label, href}) =>
              html`<a
                href=${href}
                aria-current=${href === path ? 'page' : nothing}
                >${label}</a
              >`
          )}
        </nav>
      </div>
      ${content}
      <div slot="footer" class="wa-split">
        <small id="loaded-at"
          >Layout data loaded ${loadedAt.toISOString()}</small
        >
        <note-counter></note-counter>
      </div>
    </wa-card>
  `,
});
