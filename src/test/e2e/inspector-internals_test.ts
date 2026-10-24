/**
 * The Components details carry what an element keeps in its ElementInternals:
 * custom states, form value and validity. An e2e because happy-dom has no
 * ElementInternals: the real CustomStateSet, setFormValue and validity only
 * exist in a browser.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {
  INSPECT_CMD_CHANNEL,
  INSPECT_DATA_CHANNEL,
  LIT_ID_OF_KEY,
  type InspectorDetails,
  type InspectorMessage,
} from '../../types/inspector.js';
import {type Fixture, startFixture} from './utils.js';

let fixture: Fixture;
const details: InspectorDetails[] = [];

beforeAll(async () => {
  fixture = await startFixture({plugin: {timeline: true}});
  fixture.server.hot.on(INSPECT_DATA_CHANNEL, (data: InspectorMessage) => {
    if (data.type === 'details') details.push(data.details);
  });
});

afterAll(async () => {
  await fixture?.close();
});

const latest = (id: number) => details.filter((d) => d.id === id).at(-1);

test('lists custom states, the form value and validity, and follows them live', async () => {
  await fixture.page.evaluate(`(() => {
    customElements.define('x-internals', class extends HTMLElement {
      static formAssociated = true;
      constructor() {
        super();
        this.internals = this.attachInternals();
      }
    });
    customElements.define('x-no-internals', class extends HTMLElement {});
    const form = document.createElement('form');
    const el = document.createElement('x-internals');
    el.setAttribute('name', 'pick');
    form.append(el, document.createElement('x-no-internals'));
    document.body.append(form);
    el.internals.states.add('dirty');
    el.internals.setFormValue('on', 'checked');
    el.internals.setValidity({valueMissing: true}, 'Fill this in.');
  })()`);
  const idOf = (selector: string) =>
    fixture.page.evaluate(
      `globalThis[Symbol.for(${JSON.stringify(LIT_ID_OF_KEY.description)})](document.querySelector('${selector}'))`
    ) as Promise<number>;
  const id = await idOf('x-internals');
  const plain = await idOf('x-no-internals');

  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'details', id: plain});
  await expect.poll(() => latest(plain), {timeout: 10_000}).toBeDefined();
  expect(latest(plain)).not.toHaveProperty('internals');

  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'details', id});
  await expect
    .poll(() => latest(id)?.internals, {timeout: 10_000})
    .toEqual({
      states: ['dirty'],
      value: {type: 'string', value: 'on'},
      state: {type: 'string', value: 'checked'},
      validity: {
        valid: false,
        flags: ['valueMissing'],
        message: 'Fill this in.',
      },
    });

  // A watched element re-sends its details when a state or the value
  // changes, though nothing re-renders it.
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'watch', id});
  await fixture.page.evaluate(`(() => {
    const el = document.querySelector('x-internals');
    el.internals.states.add('touched');
    const data = new FormData();
    data.append('file', new File(['abc'], 'a.txt', {type: 'text/plain'}));
    el.internals.setFormValue(data);
    el.internals.setValidity({});
  })()`);
  await expect
    .poll(() => latest(id)?.internals, {timeout: 10_000})
    .toEqual({
      states: ['dirty', 'touched'],
      value: {
        type: 'form-data',
        entries: [
          {
            name: 'file',
            value: {type: 'file', name: 'a.txt', size: 3, mime: 'text/plain'},
          },
        ],
      },
      validity: {valid: true, flags: [], message: ''},
    });
  // The element still behaves as its own: :state() and the form see it.
  expect(
    await fixture.page.evaluate(
      `document.querySelector('x-internals').matches(':state(touched)')`
    )
  ).toBe(true);
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'watch', id: null});
});
