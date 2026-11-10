import {html, nothing} from 'lit';
import {
  definePage,
  type ActionData,
  type LoadedData,
} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {actions, load} from './index.server.ts';
import '../components/note-counter.ts';

type Form = ActionData<typeof actions>;

/** The form, with what didn't validate when it comes back. */
const addNote = (form: Form | undefined) => {
  const error = form?.error;
  return html`
    <article>
      <form method="post">
        <h2 id="add">Add a note</h2>
        <label>
          Title
          <input
            name="title"
            value=${form?.title ?? ''}
            aria-invalid=${error ? 'true' : nothing}
            aria-describedby=${error ? 'form-error' : nothing}
          />
          ${error ? html`<small id="form-error" role="alert">${error}</small>` : nothing}
        </label>
        <label>Text <input name="body" value=${form?.body ?? ''} /></label>
        <button>Add</button>
      </form>
    </article>
  `;
};

export default definePage<LoadedData<typeof load>, Form>({
  title: () => 'Notes',
  head: ({notes}) =>
    html`<meta name="description" content="${notes.length} notes" />`,
  render: ({notes}, form) => html`
    <h1>Notes</h1>
    <!-- data-prefetch: resting on a note loads it ahead of the click. -->
    <ul data-prefetch>
      ${notes.map(
        (note) =>
          html`<li>
            <a href=${href('/notes/:id', {id: note.id})}>${note.title}</a>
          </li>`
      )}
    </ul>
    ${addNote(form)}
    <note-counter></note-counter>
  `,
});
