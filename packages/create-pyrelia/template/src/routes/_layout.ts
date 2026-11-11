import {html, nothing} from 'lit';
import {defineLayout} from '@oddsquad/pyrelia/page';
import {href} from '@oddsquad/pyrelia/routes';

const link = (to: string, label: string, path: string) =>
  html`<a href=${to} aria-current=${to === path ? 'page' : nothing}
    >${label}</a
  >`;

export default defineLayout('/', {
  title: ({site}) => site,
  render: (content, {site, path}) => html`
    <header>
      <nav>
        <strong>${site}</strong>
        ${link(href('/'), 'Todos', path)} ${link(href('/about'), 'About', path)}
      </nav>
    </header>
    <main>${content}</main>
  `,
});
