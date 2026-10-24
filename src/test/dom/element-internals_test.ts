// happy-dom has no ElementInternals; these run on the stand-in from
// `element-internals.ts` (the setup file). The real CustomStateSet and
// validity are covered by the e2e suite.
import {describe, expect, test} from 'vite-plus/test';
import {
  installInternalsHook,
  onInternalsChange,
  readInternals,
  summarizeFormValue,
} from '../../lib/runtime/element-internals.js';
import {collectDetails} from '../../lib/runtime/inspector/collect.js';

installInternalsHook();
installInternalsHook();

class InternalsHost extends HTMLElement {
  static formAssociated = true;
  readonly internals = this.attachInternals();
}
customElements.define('internals-host', InternalsHost);

class PlainHost extends HTMLElement {}
customElements.define('internals-plain', PlainHost);

describe('installInternalsHook', () => {
  test('hands the element its own internals and tracks them', () => {
    const el = new InternalsHost();
    expect(el.internals.states).toBeDefined();
    expect(readInternals(el)).toEqual({
      states: [],
      validity: {valid: true, flags: [], message: ''},
    });
  });

  test('reads custom states, the last form value and validity live', () => {
    const el = new InternalsHost();
    el.internals.states.add('dirty');
    el.internals.states.add('touched');
    el.internals.states.delete('dirty');
    el.internals.setFormValue('on', 'checked');
    el.internals.setValidity({valueMissing: true}, 'Fill this in.');
    expect(readInternals(el)).toEqual({
      states: ['touched'],
      value: {type: 'string', value: 'on'},
      state: {type: 'string', value: 'checked'},
      validity: {
        valid: false,
        flags: ['valueMissing'],
        message: 'Fill this in.',
      },
    });
    el.internals.setFormValue(null);
    expect(readInternals(el)?.value).toEqual({type: 'null'});
    expect(readInternals(el)).not.toHaveProperty('state');
  });

  test('tells a listener about each change until released', () => {
    const el = new InternalsHost();
    let calls = 0;
    const release = onInternalsChange(el, () => calls++);
    el.internals.states.add('a');
    el.internals.states.clear();
    el.internals.setFormValue('x');
    el.internals.setValidity({});
    expect(calls).toBe(4);
    release();
    el.internals.states.add('b');
    expect(calls).toBe(4);
  });

  test('leaves elements without internals out of the details', () => {
    expect(readInternals(new PlainHost())).toBeUndefined();
    expect(collectDetails(new PlainHost())).not.toHaveProperty('internals');
    const el = new InternalsHost();
    el.internals.states.add('on');
    expect(collectDetails(el).internals?.states).toEqual(['on']);
  });
});

describe('summarizeFormValue', () => {
  test('summarizes a File and the entries of a FormData', () => {
    const file = new File(['abc'], 'photo.png', {type: 'image/png'});
    expect(summarizeFormValue(file)).toEqual({
      type: 'file',
      name: 'photo.png',
      size: 3,
      mime: 'image/png',
    });
    const data = new FormData();
    data.append('tag', 'a');
    data.append('tag', 'b');
    expect(summarizeFormValue(data)).toEqual({
      type: 'form-data',
      entries: [
        {name: 'tag', value: {type: 'string', value: 'a'}},
        {name: 'tag', value: {type: 'string', value: 'b'}},
      ],
    });
  });

  test('counts FormData entries past the first twenty', () => {
    const data = new FormData();
    for (let i = 0; i < 25; i++) data.append('n', String(i));
    const v = summarizeFormValue(data);
    expect(v.type === 'form-data' && v.entries.length).toBe(20);
    expect(v).toHaveProperty('more', 5);
  });
});
