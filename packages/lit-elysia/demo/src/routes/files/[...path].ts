import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';

export default definePage('/files/*', {
  title: ({segments}) => `Files: ${segments.join('/')}`,
  render: ({segments}) => html`
    <h1>Catch-all</h1>
    <p>
      <code>routes/files/[...path].ts</code> answers every path under
      <code>/files/</code>.
    </p>
    <ol id="segments">
      ${segments.map((segment) => html`<li>${segment}</li>`)}
    </ol>
    <p>
      <a href=${href('/files/*', {'*': 'one'})}>one segment</a> ·
      <a href=${href('/files/*', {'*': 'a/b/c/d/e'})}>five segments</a>
    </p>
  `,
});
