import {Elysia, t} from 'elysia';
import {addTodo, allTodos} from './todos.ts';

/** Your app: its API sits beside the pages. */
export default new Elysia({prefix: '/api'})
  .get('/todos', () => allTodos())
  .post('/todos', {body: t.Object({text: t.String()})}, ({body}) =>
    addTodo(body.text)
  );

/** The pages' context: every load and action gets `site`, typed. */
export const context = new Elysia({name: 'context'}).decorate('site', {
  name: '%NAME%',
});
