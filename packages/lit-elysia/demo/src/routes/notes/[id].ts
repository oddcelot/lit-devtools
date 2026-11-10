import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {load} from './[id].server.ts';
import '../../components/note-counter.ts';

export default definePage<LoadedData<typeof load>>({
  title: (note) => note.title,
  head: (note) => html`
    <meta name="description" content=${note.body} />
    <link rel="canonical" href="/notes/${note.id}" />
  `,
  render: (note) => html`
    <div slot="header">
      <a href=${href('/')}>← All notes</a>
      <h1>${note.title}</h1>
    </div>
    <p>${note.body}</p>
    <div slot="footer" class="wa-split">
      <small>
        Written
        <time datetime=${note.createdAt.toISOString()}
          >${note.createdAt.toISOString().slice(0, 10)}</time
        >
      </small>
      <note-counter></note-counter>
    </div>
  `,
});
