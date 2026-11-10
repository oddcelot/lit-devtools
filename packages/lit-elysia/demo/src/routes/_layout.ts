import {html} from 'lit';
import {defineLayout, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './_layout.server.ts';
import '../components/layout-clicks.ts';

export default defineLayout<LoadedData<typeof load>>({
  title: () => 'Notes',
  render: (content, {count}) => html`
    <header>
      <a href="/">Notes</a> · <span id="note-count">${count} notes</span>
      <layout-clicks></layout-clicks>
    </header>
    <main>${content}</main>
  `,
});
