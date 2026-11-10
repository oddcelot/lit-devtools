import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './[...path].server.ts';

export default definePage<LoadedData<typeof load>>({
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
      <a href="/files/one">one segment</a> ·
      <a href="/files/a/b/c/d/e">five segments</a>
    </p>
  `,
});
