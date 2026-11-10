import {html, nothing} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './visitor.server.ts';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/input/input.js';

export default definePage<LoadedData<typeof load>>({
  title: () => 'Who you are',
  render: ({visitor, site, from}) => html`
    <h1>Who you are</h1>
    ${
      from === 'private'
        ? html`<wa-callout variant="warning" role="alert"
            >The private page wants a name first.</wa-callout
          >`
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
    <form method="post" class="wa-cluster wa-align-items-end">
      <wa-input name="name" label="Name" value=${visitor ?? ''}></wa-input>
      <wa-button type="submit" variant="brand">Save</wa-button>
    </form>
  `,
});
