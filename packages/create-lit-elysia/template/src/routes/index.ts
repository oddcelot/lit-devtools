import {html, nothing} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';
import '../components/click-counter.ts';

export default definePage('/', {
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
