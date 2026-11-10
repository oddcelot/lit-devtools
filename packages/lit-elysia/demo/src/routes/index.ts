import {html, nothing} from 'lit';
import {
  definePage,
  type ActionData,
  type LoadedData,
} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {actions, load} from './index.server.ts';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import '../components/note-counter.ts';

type Form = ActionData<typeof actions>;

/** The form, with what didn't validate when it comes back. */
const addNote = (form: Form | undefined) => {
  const error = form?.error;
  return html`
    <wa-card>
      <h2 slot="header" id="add">Add a note</h2>
      <form method="post" class="wa-stack">
        ${
          error
            ? html`<wa-callout id="form-error" variant="danger" role="alert"
                >${error}</wa-callout
              >`
            : nothing
        }
        <wa-input
          name="title"
          label="Title"
          value=${form?.title ?? ''}
        ></wa-input>
        <wa-input name="body" label="Text" value=${form?.body ?? ''}></wa-input>
        <div><wa-button type="submit" variant="brand">Add</wa-button></div>
      </form>
    </wa-card>
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
