/**
 * The Components details snapshot lists non-reactive instance state. Worth an
 * e2e because the shapes it duck-types (a `@lit/task` controller held in a
 * private field, Lit's private controller set) only exist on real components
 * built by the real Lit in a real page.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {
  INSPECT_CMD_CHANNEL,
  INSPECT_DATA_CHANNEL,
  type InspectorDetails,
  type InspectorMessage,
  type InspectorTreeNode,
} from '../../types/inspector.js';
import {type Fixture, startFixture} from './utils.js';

let fixture: Fixture;
let roots: InspectorTreeNode[] = [];
const details: InspectorDetails[] = [];

beforeAll(async () => {
  fixture = await startFixture({plugin: {timeline: true}});
  fixture.server.hot.on(INSPECT_DATA_CHANNEL, (data: InspectorMessage) => {
    if (data.type === 'tree') roots = data.roots;
    if (data.type === 'details') details.push(data.details);
  });
});

afterAll(async () => {
  await fixture?.close();
});

const find = (nodes: InspectorTreeNode[], tag: string): number | undefined => {
  for (const node of nodes) {
    if (node.tagName === tag) return node.id;
    const found = find(node.children, tag);
    if (found !== undefined) return found;
  }
  return undefined;
};

test('lists a real @lit/task by its field name with its status and value', async () => {
  // Let the fake fetch settle, so the task is complete when it is read.
  await expect
    .poll(
      () =>
        fixture.page.evaluate(
          `document.querySelector('hmr-task')?.shadowRoot?.querySelector('#user')?.textContent ?? ''`
        ),
      {timeout: 10_000}
    )
    .toContain('Ada Lovelace');

  await expect
    .poll(
      () => {
        fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'tree'});
        return find(roots, 'hmr-task');
      },
      {timeout: 10_000}
    )
    .toBeDefined();
  const id = find(roots, 'hmr-task')!;

  await expect
    .poll(
      () => {
        fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'details', id});
        return details.find((d) => d.id === id)?.extras;
      },
      {timeout: 10_000}
    )
    .toContainEqual(
      expect.objectContaining({
        kind: 'task',
        name: 'userTask',
        type: 'Task',
        status: 'complete',
      })
    );
});

test('links a real @consume to its @provide and follows the value live', async () => {
  const detailsOf = (tag: string) => {
    const id = find(roots, tag);
    if (id === undefined) {
      fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'tree'});
      return undefined;
    }
    fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'details', id});
    return details.filter((d) => d.id === id).at(-1);
  };
  const contextOf = (tag: string) =>
    detailsOf(tag)?.extras?.find((e) => e.kind === 'context');

  await expect
    .poll(() => contextOf('hmr-ctx-consumer')?.context?.provider, {
      timeout: 10_000,
    })
    .toMatchObject({tagName: 'hmr-ctx-provider', id: expect.any(Number)});
  expect(contextOf('hmr-ctx-consumer')?.context).toMatchObject({
    role: 'consumer',
    key: 'hmr-counter-context',
  });
  await expect
    .poll(() => contextOf('hmr-ctx-provider')?.context?.consumers)
    .toMatchObject([{tagName: 'hmr-ctx-consumer'}]);

  const before = contextOf('hmr-ctx-consumer')?.value;
  await fixture.page.click('hmr-ctx-provider #provide-increment');
  await expect
    .poll(() => contextOf('hmr-ctx-consumer')?.value, {timeout: 10_000})
    .not.toBe(before);
});

test('set-prop writes a primitive to the live element and answers with it', async () => {
  const idOf = () => {
    const id = find(roots, 'hmr-properties');
    if (id === undefined) {
      fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'tree'});
    }
    return id;
  };
  await expect.poll(idOf, {timeout: 10_000}).toBeDefined();
  const id = idOf()!;
  const factorRow = () =>
    details
      .filter((d) => d.id === id)
      .at(-1)
      ?.properties.find((p) => p.name === 'factor');

  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {
    type: 'set-prop',
    id,
    name: 'factor',
    value: 9,
  });
  await expect
    .poll(
      () =>
        fixture.page.evaluate(
          `document.querySelector('hmr-properties').factor`
        ),
      {timeout: 10_000}
    )
    .toBe(9);
  await expect
    .poll(factorRow, {timeout: 10_000})
    .toMatchObject({value: '9', editable: 'number'});

  // The wrong type is refused and the page's value is what comes back.
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {
    type: 'set-prop',
    id,
    name: 'factor',
    value: 'nine',
  });
  await expect.poll(factorRow, {timeout: 10_000}).toMatchObject({value: '9'});
  expect(
    await fixture.page.evaluate(
      `document.querySelector('hmr-properties').factor`
    )
  ).toBe(9);
});

test('an override holds against app writes until it is switched off', async () => {
  await expect
    .poll(() => find(roots, 'hmr-properties'), {timeout: 10_000})
    .toBeDefined();
  const id = find(roots, 'hmr-properties')!;
  const el = `document.querySelector('hmr-properties')`;
  const shown = () =>
    fixture.page.evaluate(
      `${el}.shadowRoot.querySelector('#factor').textContent`
    );
  const send = (cmd: Record<string, unknown>) =>
    fixture.server.hot.send(INSPECT_CMD_CHANNEL, cmd);

  send({type: 'set-prop', id, name: 'factor', value: 7});
  await expect.poll(shown, {timeout: 10_000}).toBe('factor: 7');
  // The app's own write lands underneath.
  await fixture.page.evaluate(`${el}.factor = 4`);
  await fixture.page.evaluate(`${el}.updateComplete`);
  expect(await shown()).toBe('factor: 7');

  send({type: 'override-toggle', id, name: 'factor', enabled: false});
  await expect.poll(shown, {timeout: 10_000}).toBe('factor: 4');
  send({type: 'override-toggle', id, name: 'factor', enabled: true});
  await expect.poll(shown, {timeout: 10_000}).toBe('factor: 7');

  send({type: 'override-remove', id, name: 'factor'});
  await expect.poll(shown, {timeout: 10_000}).toBe('factor: 4');
  expect(await fixture.page.evaluate(`Object.hasOwn(${el}, 'factor')`)).toBe(
    false
  );
  // Lit's own accessor renders app writes again.
  await fixture.page.evaluate(`${el}.factor = 5`);
  await expect.poll(shown, {timeout: 10_000}).toBe('factor: 5');
});

test('a keyed set-prop writes a leaf of a live object and re-renders', async () => {
  await expect
    .poll(() => find(roots, 'hmr-properties'), {timeout: 10_000})
    .toBeDefined();
  const id = find(roots, 'hmr-properties')!;
  const config = `document.querySelector('hmr-properties').config`;
  const same = await fixture.page.evaluate(`window.__cfg = ${config}, true`);
  expect(same).toBe(true);

  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {
    type: 'set-prop',
    id,
    name: 'config',
    value: 'dark',
    keys: ['colorScheme'],
  });
  await expect
    .poll(() => fixture.page.evaluate(`${config}.colorScheme`), {
      timeout: 10_000,
    })
    .toBe('dark');
  // Written in place, and the element rendered it.
  expect(await fixture.page.evaluate(`window.__cfg === ${config}`)).toBe(true);
  await expect
    .poll(
      () =>
        fixture.page.evaluate(
          `document.querySelector('hmr-properties').shadowRoot.querySelector('#color-scheme').textContent`
        ),
      {timeout: 10_000}
    )
    .toContain('dark');
});

test('a leaf override switches off to the old value and drops with its object', async () => {
  await expect
    .poll(() => find(roots, 'hmr-properties'), {timeout: 10_000})
    .toBeDefined();
  const id = find(roots, 'hmr-properties')!;
  const overrides: Array<Extract<InspectorMessage, {type: 'overrides'}>> = [];
  fixture.server.hot.on(INSPECT_DATA_CHANNEL, (data: InspectorMessage) => {
    if (data.type === 'overrides') overrides.push(data);
  });
  const el = `document.querySelector('hmr-properties')`;
  const shown = () =>
    fixture.page.evaluate(
      `${el}.shadowRoot.querySelector('#color-scheme').textContent`
    );
  const send = (cmd: Record<string, unknown>) =>
    fixture.server.hot.send(INSPECT_CMD_CHANNEL, cmd);
  const keys = ['colorScheme'];
  // The test above left its own override on this leaf.
  send({type: 'override-remove', id, name: 'config', keys});
  await expect.poll(shown, {timeout: 10_000}).toBe('color-scheme: auto');

  send({type: 'set-prop', id, name: 'config', value: 'light', keys});
  await expect.poll(shown, {timeout: 10_000}).toBe('color-scheme: light');
  send({type: 'override-toggle', id, name: 'config', keys, enabled: false});
  await expect.poll(shown, {timeout: 10_000}).toBe('color-scheme: auto');
  send({type: 'override-toggle', id, name: 'config', keys, enabled: true});
  await expect.poll(shown, {timeout: 10_000}).toBe('color-scheme: light');

  // The app replaces the object: the override has nothing left to hold.
  await fixture.page.click('hmr-properties #toggle-color-scheme');
  await expect.poll(shown, {timeout: 10_000}).toBe('color-scheme: dark');
  send({type: 'overrides'});
  await expect
    .poll(() => overrides.at(-1), {timeout: 10_000})
    .toMatchObject({
      entries: [],
      dropped: [{id, name: 'config', keys, value: '"light"'}],
    });
});

test('an override kept across reloads is back on the first render', async () => {
  const idOf = () => {
    const id = find(roots, 'hmr-properties');
    if (id === undefined) {
      fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'tree'});
    }
    return id;
  };
  await expect.poll(idOf, {timeout: 10_000}).toBeDefined();
  const send = (cmd: Record<string, unknown>) =>
    fixture.server.hot.send(INSPECT_CMD_CHANNEL, cmd);
  const el = `document.querySelector('hmr-properties')`;
  const shown = () =>
    fixture.page.evaluate(
      `${el}?.shadowRoot?.querySelector('#label')?.textContent`
    );
  const errors: string[] = [];
  fixture.page.on('pageerror', (e) => errors.push(e.message));

  const id = idOf()!;
  send({type: 'set-prop', id, name: 'label', value: 'kept'});
  send({type: 'override-persist', id, name: 'label', persist: true});
  await expect.poll(shown, {timeout: 10_000}).toBe('label: kept');
  await expect
    .poll(
      () =>
        fixture.page.evaluate(
          `sessionStorage.getItem('lit-devtools-overrides') ?? ''`
        ),
      {timeout: 10_000}
    )
    .toContain('"kept"');

  roots = [];
  await fixture.page.reload();
  await expect.poll(shown, {timeout: 10_000}).toBe('label: kept');
  // On from the first render: the element rendered once, not twice.
  expect(await fixture.page.evaluate(`${el}.renders`)).toBe(1);
  // The reflected attribute follows the override too.
  expect(await fixture.page.evaluate(`${el}.getAttribute('label')`)).toBe(
    'kept'
  );
  expect(errors).toEqual([]);

  // Removed, it is gone after the next reload.
  await expect.poll(idOf, {timeout: 10_000}).toBeDefined();
  send({type: 'override-remove', id: idOf()!, name: 'label'});
  await expect.poll(shown, {timeout: 10_000}).toBe('label: initial');
  roots = [];
  await fixture.page.reload();
  await expect.poll(shown, {timeout: 10_000}).toBe('label: initial');
});
