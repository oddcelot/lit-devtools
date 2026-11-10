import {html, nothing} from 'lit';
import {
  definePage,
  type ActionData,
  type LoadedData,
} from '@oddsquad/lit-elysia/page';
import type {actions, load} from './index.server.ts';
import '../components/note-counter.ts';

export default definePage<LoadedData<typeof load>, ActionData<typeof actions>>({
  title: () => 'Notes',
  head: ({notes}) =>
    html`<meta name="description" content="${notes.length} notes" />`,
  render: ({notes}, form) => html`
    <h1>Notes</h1>
    <ul>
      ${notes.map(
        (note) => html`<li><a href="/notes/${note.id}">${note.title}</a></li>`
      )}
    </ul>
    <form method="post">
      <h2>Add a note</h2>
      ${
        form?.error
          ? html`<p id="form-error" role="alert">${form.error}</p>`
          : nothing
      }
      <label>Title <input name="title" value=${form?.title ?? ''} /></label>
      <label>Text <input name="body" value=${form?.body ?? ''} /></label>
      <button>Add</button>
    </form>
    <p>
      <a href="/latest">Newest note</a> ·
      <a href="/notes/1?slow">A slow note</a> ·
      <a href="/notes/99">A note that isn't there</a> ·
      <a href="/notes/1" data-reload>First note, as a full load</a> ·
      <a href="/broken">A page that fails</a> ·
      <a href="/nowhere">A page that doesn't exist</a>
    </p>
    <note-counter></note-counter>
  `,
});
