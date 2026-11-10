import {html, nothing} from 'lit';
import {
  definePage,
  type ActionData,
  type LoadedData,
} from '@oddsquad/lit-elysia/page';
import type {actions, load} from './index.server.ts';
import '../components/click-counter.ts';

export default definePage<LoadedData<typeof load>, ActionData<typeof actions>>({
  title: () => 'Todos',
  render: ({todos}, form) => html`
    <h1>Todos</h1>
    <ul>
      ${todos.map((todo) => html`<li>${todo.text}</li>`)}
    </ul>
    <form method="post">
      <input name="text" aria-label="New todo" />
      <button>Add</button>
      ${form?.error ? html`<p role="alert">${form.error}</p>` : nothing}
    </form>
    <click-counter></click-counter>
  `,
});
