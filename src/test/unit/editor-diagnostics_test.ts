import {expect, test} from 'vite-plus/test';
import type {ComponentDocs} from '../../types/component-docs.js';
import {eventTypeProblems} from '../../lib/editor/diagnostics.js';
import type {DocsSource} from '../../lib/editor/features.js';

const card: ComponentDocs = {
  tagName: 'x-card',
  className: 'XCard',
  properties: [],
  attributes: [],
  events: [{name: 'add', type: 'CustomEvent<{id: string; price: number}>'}],
  slots: [],
  cssParts: [],
  cssProperties: [],
  cssStates: [],
  origin: {manifest: '', module: 'src/x-card.ts', source: true},
};

const source: DocsSource = {
  get: async (_file, tag) => (tag === 'x-card' ? card : null),
  tags: async () => ['x-card'],
};

const problemsIn = async (code: string) =>
  (
    await eventTypeProblems(source, {
      file: '/app/src/app.ts',
      code,
      kind: 'script',
    })
  ).map((problem) => ({
    ...problem,
    text: code.slice(problem.start, problem.end),
  }));

test('a method whose parameter wants a key the event lacks', async () => {
  const code = `
    class App extends LitElement {
      render() {
        return html\`<main @add=\${this.#onAdd}><x-card></x-card></main>\`;
      }
      #onAdd(e: CustomEvent<{thing: string}>) {}
    }
  `;
  expect(await problemsIn(code)).toEqual([
    {
      rule: 'event-type',
      start: expect.any(Number),
      end: expect.any(Number),
      text: 'this.#onAdd',
      message:
        '`#onAdd` takes `CustomEvent<{thing: string}>`, but `add` sends `CustomEvent<{id: string; price: number}>`: `detail.thing` is missing.',
    },
  ]);
});

test('an arrow function field and a typed inline handler', async () => {
  const code = `
    class App extends LitElement {
      onAdd = (e: CustomEvent<{id: number}>) => {};
      render() {
        return html\`
          <x-card @add=\${this.onAdd}></x-card>
          <x-card @add=\${(e: CustomEvent<{price: string}>) => go(e)}></x-card>
        \`;
      }
    }
  `;
  expect(
    (await problemsIn(code)).map((p) => p.message.split(': ').at(-1))
  ).toEqual([
    '`detail.id` is `string`, not `number`.',
    '`detail.price` is `number`, not `string`.',
  ]);
});

test('nothing for handlers that fit, are untyped, or that it cannot read', async () => {
  const code = `
    class App extends LitElement {
      #fits(e: CustomEvent<{id: string}>) {}
      #named(e: CustomEvent<Item>) {}
      render() {
        return html\`
          <x-card @add=\${this.#fits}></x-card>
          <x-card @add=\${this.#named}></x-card>
          <x-card @add=\${(e) => go(e)}></x-card>
          <x-card @add=\${this.#missing}></x-card>
          <x-card @add=\${handlers.add}></x-card>
          <x-card @other=\${this.#named}></x-card>
        \`;
      }
    }
  `;
  expect(await problemsIn(code)).toEqual([]);
});

test("JSX's on<event> and Solid's on: handlers", async () => {
  const code = `
    const a = (
      <main>
        <x-card onadd={(e: CustomEvent<{id: number}>) => go(e)} />
        <x-card on:add={(e: CustomEvent<{price: string}>) => go(e)} />
        <x-card onAdd={(e: CustomEvent<{id: number}>) => go(e)} />
        <x-card onclick={(e: KeyboardEvent) => go(e)} />
      </main>
    );
  `;
  const problems = await eventTypeProblems(source, {
    file: '/app/src/app.tsx',
    code,
    kind: 'jsx',
  });
  expect(problems.map((p) => p.message)).toEqual([
    'The handler takes `CustomEvent<{id: number}>`, but `add` sends `CustomEvent<{id: string; price: number}>`: `detail.id` is `string`, not `number`.',
    'The handler takes `CustomEvent<{price: string}>`, but `add` sends `CustomEvent<{id: string; price: number}>`: `detail.price` is `number`, not `string`.',
  ]);
});
