import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';

export default definePage({
  title: () => 'About',
  render: () => html`
    <h1>About</h1>
    <p>
      Pages live in <code>src/routes</code>, your Elysia app in
      <code>src/server.ts</code>. Edit either while <code>dev</code> runs.
    </p>
  `,
});
