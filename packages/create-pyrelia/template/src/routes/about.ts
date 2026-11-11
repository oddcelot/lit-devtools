import {html} from 'lit';
import {definePage} from '@oddsquad/pyrelia/page';

export default definePage('/about', {
  title: () => 'About',
  render: () => html`
    <h1>About</h1>
    <p>
      Pages live in <code>src/routes</code>, your Elysia app in
      <code>src/server.ts</code>. Edit either while <code>dev</code> runs.
    </p>
  `,
});
