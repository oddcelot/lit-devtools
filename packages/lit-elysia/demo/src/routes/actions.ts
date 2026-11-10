import {html, nothing} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';

export default definePage('/actions', {
  title: () => 'Named actions',
  render: ({count}, form) => html`
    <h1>Named actions</h1>
    <p>
      Two forms, two actions: <code>?/increment</code> and <code>?/reset</code>.
    </p>
    <p>Server count: <strong id="server-count">${count}</strong></p>
    ${
      form
        ? html`<wa-callout id="action-result" role="status"
            >${form.done}</wa-callout
          >`
        : nothing
    }
    <div class="wa-cluster">
      <form method="post" action="?/increment">
        <wa-button type="submit" variant="brand">Add one</wa-button>
      </form>
      <form method="post" action="?/reset">
        <wa-button type="submit">Reset</wa-button>
      </form>
    </div>
  `,
});
