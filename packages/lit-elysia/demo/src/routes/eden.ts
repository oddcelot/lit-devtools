import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import '../components/api-notes.ts';

export default definePage({
  title: () => 'Eden client',
  render: () => html`
    <h1>Eden client</h1>
    <p>
      The component below calls the JSON API in
      <code>src/server.ts</code> through <code>api</code> from
      <code>@oddsquad/lit-elysia/eden</code>, an Eden Treaty client typed from
      that app: rename a route there and the component fails the type check.
    </p>
    <api-notes></api-notes>
  `,
});
