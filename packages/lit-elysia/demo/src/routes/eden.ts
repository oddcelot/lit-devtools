import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import '../components/api-notes.ts';

export default definePage('/eden', {
  title: () => 'Eden client',
  render: () => html`
    <h1>Eden client</h1>
    <p>
      The component below calls the JSON API in
      <code>src/server.ts</code> through <code>api</code> from
      <code>@oddsquad/lit-elysia/eden</code>, an Eden Treaty client typed from
      that app: rename a route there and the component fails the type check.
    </p>
    <p>
      Errors are typed too: the API answers <code>status(409, …)</code> for a
      title that is taken and <code>status(404, …)</code> for a note that isn't
      there, and the component narrows <code>error</code> by its status to read
      each body.
    </p>
    <api-notes></api-notes>
  `,
});
