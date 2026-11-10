import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import {invalidate} from '@oddsquad/lit-elysia/routes';
import type {load} from './cached.server.ts';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '../components/note-counter.ts';

export default definePage<LoadedData<typeof load>>({
  title: () => 'Cached for 10 seconds',
  render: ({renderedAt, notes}) => html`
    <h1>Cached for 10 seconds</h1>
    <p>
      Loaded at
      <time id="loaded-at">${renderedAt.toISOString().slice(11, 23)}</time> with
      <strong id="cached-notes">${notes}</strong> notes.
    </p>
    <p>
      Leave and come back within ten seconds: the time stays, as the browser had
      the data. Add a note first, and it doesn't: a form action changes data, so
      the router asks again.
    </p>
    <wa-button
      id="revalidate"
      variant="brand"
      @click=${() => invalidate('clock')}
    >
      Load again: invalidate('clock')
    </wa-button>
    <note-counter></note-counter>
  `,
});
