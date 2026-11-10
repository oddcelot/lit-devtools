import {html, nothing} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './visitor.server.ts';

export default definePage<LoadedData<typeof load>>({
  title: () => 'Who you are',
  render: ({visitor, site, from}) => html`
    <h1>Who you are</h1>
    ${
      from === 'private'
        ? html`<p role="alert">The private page wants a name first.</p>`
        : nothing
    }
    <p id="greeting">
      ${visitor ? `Hello, ${visitor}.` : 'Hello, stranger.'} Welcome to ${site}.
    </p>
    <p>
      <code>visitor</code> is derived from a cookie by the
      <code>context</code> plugin in <code>src/server.ts</code>, and typed in
      this page's load.
    </p>
    <form method="post">
      <label>Name <input name="name" value=${visitor ?? ''} /></label>
      <button>Save</button>
    </form>
  `,
});
