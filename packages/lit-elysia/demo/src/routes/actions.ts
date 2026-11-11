import {html, nothing} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import {action} from '@oddsquad/lit-elysia/routes';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/input/input.js';

export default definePage('/actions', {
  title: () => 'Named actions',
  render: ({count}, form) => html`
    <h1>Named actions</h1>
    <p>
      One form, three actions. Each button names its own with
      <code>formaction</code>, built by <code>action()</code>:
      <code>?/add</code>, <code>?/subtract</code> or <code>?/reset</code>. The
      form's fields go with whichever button posts it, so Add and Subtract share
      the step; Reset ignores it.
    </p>
    <p>Server count: <strong id="server-count">${count}</strong></p>
    ${
      form
        ? html`<wa-callout id="action-result" role="status"
            >${form.done}</wa-callout
          >`
        : nothing
    }
    <form method="post" class="wa-cluster wa-align-items-end">
      <wa-input
        name="step"
        type="number"
        label="Step"
        min="1"
        max="100"
        value=${form && 'step' in form ? form.step : 1}
      ></wa-input>
      <wa-button
        type="submit"
        variant="brand"
        formaction=${action('/actions', 'add')}
        >Add</wa-button
      >
      <wa-button type="submit" formaction=${action('/actions', 'subtract')}
        >Subtract</wa-button
      >
      <wa-button
        type="submit"
        variant="danger"
        appearance="outlined"
        formaction=${action('/actions', 'reset')}
        >Reset</wa-button
      >
    </form>
  `,
});
