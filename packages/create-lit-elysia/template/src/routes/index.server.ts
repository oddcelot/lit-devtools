import {fail} from '@oddsquad/lit-elysia/page';
import {href, route} from '@oddsquad/lit-elysia/routes';
import {addTodo, allTodos} from '../todos.ts';

export const load = route('/').load(() => ({todos: allTodos()}));

export const actions = route('/').actions({
  default: ({body, redirect}) => {
    const text = typeof body['text'] === 'string' ? body['text'].trim() : '';
    if (!text) return fail(400, {error: 'Write something first.'});
    addTodo(text);
    return redirect(href('/'), 303);
  },
});
