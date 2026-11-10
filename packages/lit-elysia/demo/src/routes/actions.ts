import {html, nothing} from 'lit';
import {
  definePage,
  type ActionData,
  type LoadedData,
} from '@oddsquad/lit-elysia/page';
import type {actions, load} from './actions.server.ts';

export default definePage<LoadedData<typeof load>, ActionData<typeof actions>>({
  title: () => 'Named actions',
  render: ({count}, form) => html`
    <h1>Named actions</h1>
    <p>
      Two forms, two actions: <code>?/increment</code> and <code>?/reset</code>.
    </p>
    <p>Server count: <strong id="server-count">${count}</strong></p>
    ${form ? html`<p id="action-result" role="status">${form.done}</p>` : nothing}
    <div class="actions">
      <form method="post" action="?/increment"><button>Add one</button></form>
      <form method="post" action="?/reset">
        <button class="secondary">Reset</button>
      </form>
    </div>
  `,
});
