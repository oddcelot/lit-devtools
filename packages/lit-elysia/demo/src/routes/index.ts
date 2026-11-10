import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './index.server.ts';
import '../components/note-counter.ts';

export default definePage<LoadedData<typeof load>>({
  title: () => 'Notes',
  render: ({notes}) => html`
    <h1>Notes</h1>
    <ul>
      ${notes.map(
        (note) => html`<li><a href="/notes/${note.id}">${note.title}</a></li>`
      )}
    </ul>
    <note-counter></note-counter>
  `,
});
