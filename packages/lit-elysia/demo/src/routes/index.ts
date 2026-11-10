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
    <p>
      <a href="/latest">Newest note</a> ·
      <a href="/notes/99">A note that isn't there</a> ·
      <a href="/notes/1" data-reload>First note, as a full load</a> ·
      <a href="/broken">A page that fails</a> ·
      <a href="/nowhere">A page that doesn't exist</a>
    </p>
    <note-counter></note-counter>
  `,
});
