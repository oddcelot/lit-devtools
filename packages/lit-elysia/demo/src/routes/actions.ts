import {html, nothing} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import {action} from '@oddsquad/lit-elysia/routes';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';

export default definePage('/actions', {
  title: () => 'Named actions',
  render: ({count}, form) => html`
    <h1>Named actions</h1>
    <p>
      One form, two actions: each button names its own with
      <code>formaction</code>, <code>?/increment</code> or <code>?/reset</code>,
      built by <code>action()</code>.
    </p>
    <p>Server count: <strong id="server-count">${count}</strong></p>
    ${
      form
        ? html`<wa-callout id="action-result" role="status"
            >${form.done}</wa-callout
          >`
        : nothing
    }
    <form method="post" class="wa-cluster">
      <wa-button
        type="submit"
        variant="brand"
        formaction=${action('/actions', 'increment')}
        >Add one</wa-button
      >
      <wa-button type="submit" formaction=${action('/actions', 'reset')}
        >Reset</wa-button
      >
    </form>
  `,
});
