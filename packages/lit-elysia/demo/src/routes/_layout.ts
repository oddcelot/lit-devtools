import {html} from 'lit';
import {defineLayout, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './_layout.server.ts';
import '../components/layout-clicks.ts';

export default defineLayout<LoadedData<typeof load>>({
  title: () => 'Notes',
  head: () => html`<meta name="theme-color" content="#324fff" />`,
  render: (content, {count}) => html`
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
    <main class="container">${content}</main>
  `,
});
