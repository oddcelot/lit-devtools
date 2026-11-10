import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import '../components/note-feed.ts';

export default definePage('/live', {
  title: () => 'Live feed',
  render: () => html`
    <h1>Live feed</h1>
    <p>
      <code>GET /api/notes/feed</code> in <code>src/server.ts</code> is a
      generator: it <code>yield</code>s <code>sse(…)</code> for each note added,
      for as long as the client listens. The component below reads the events
      through Eden with <code>for await</code>, each typed from what the route
      yields.
    </p>
    <p>
      Add a note here, on
      <a href=${href('/', {}, {hash: 'add'})}>the notes page</a>, or in another
      tab, and it arrives. Leave the page and the component stops listening,
      which ends the generator on the server too.
    </p>
    <note-feed></note-feed>
  `,
});
