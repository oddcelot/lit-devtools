export interface Todo {
  id: number;
  text: string;
  createdAt: Date;
}

const todos: Todo[] = [{id: 1, text: 'Try the counter', createdAt: new Date()}];

export const allTodos = (): Todo[] => todos;

export const addTodo = (text: string): Todo => {
  const todo = {id: todos.length + 1, text, createdAt: new Date()};
  todos.push(todo);
  return todo;
};
