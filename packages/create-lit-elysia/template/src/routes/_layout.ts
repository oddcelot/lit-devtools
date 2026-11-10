import {html, nothing} from 'lit';
import {defineLayout, type LoadedData} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {load} from './_layout.server.ts';

const link = (to: string, label: string, path: string) =>
  html`<a href=${to} aria-current=${to === path ? 'page' : nothing}
    >${label}</a
  >`;

export default defineLayout<LoadedData<typeof load>>({
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
