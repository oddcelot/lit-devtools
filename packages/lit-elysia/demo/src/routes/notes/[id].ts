import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './[id].server.ts';
import '../../components/note-counter.ts';

export default definePage<LoadedData<typeof load>>({
  title: (note) => note.title,
  render: (note) => html`
    <a href="/">← All notes</a>
    <h1>${note.title}</h1>
    <p>${note.body}</p>
    <p>
      Written
      <time datetime=${note.createdAt.toISOString()}
        >${note.createdAt.toISOString().slice(0, 10)}</time
      >
    </p>
    <note-counter></note-counter>
  `,
});
