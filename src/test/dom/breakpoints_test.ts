import {LitElement, html, type PropertyDeclarations} from 'lit';
import {afterEach, expect, test} from 'vite-plus/test';
import {
  clearBreakpoints,
  setBreakpoint,
} from '../../lib/runtime/inspector/breakpoints.js';

let n = 0;
const make = () => {
  const tag = `bp-el-${n++}`;
  class El extends LitElement {
    static override properties: PropertyDeclarations = {count: {type: Number}};
    declare count: number;
    renders = 0;
    constructor() {
      super();
      this.count = 0;
    }
    override render() {
      this.renders++;
      return html`${this.count}`;
    }
  }
  customElements.define(tag, El);
  const el = document.createElement(tag) as El;
  document.body.append(el);
  return el;
};

afterEach(() => {
  clearBreakpoints();
  document.body.replaceChildren();
});

test('a method breakpoint shadows the method on that instance only', async () => {
  const el = make();
  const other = document.createElement(el.localName) as typeof el;
  document.body.append(other);
  await el.updateComplete;
  expect(setBreakpoint(el, {kind: 'method', name: 'render'}, true)).toBe(true);
  expect(Object.hasOwn(el, 'render')).toBe(true);
  expect(Object.hasOwn(other, 'render')).toBe(false);

  // The element's own render still runs through the wrapper.
  el.count = 5;
  await el.updateComplete;
  expect(el.renders).toBe(2);
  expect(el.shadowRoot!.textContent).toContain('5');

  setBreakpoint(el, {kind: 'method', name: 'render'}, false);
  expect(Object.hasOwn(el, 'render')).toBe(false);
});

test('a property breakpoint wraps requestUpdate until its last one goes', async () => {
  const el = make();
  await el.updateComplete;
  expect(setBreakpoint(el, {kind: 'prop', name: 'count'}, true)).toBe(true);
  expect(Object.hasOwn(el, 'requestUpdate')).toBe(true);
  el.count = 3;
  await el.updateComplete;
  expect(el.shadowRoot!.textContent).toContain('3');
  setBreakpoint(el, {kind: 'prop', name: 'count'}, false);
  expect(Object.hasOwn(el, 'requestUpdate')).toBe(false);
});

test('refuses what it cannot arm, and leaves slots it does not own', () => {
  const el = make();
  expect(setBreakpoint(el, {kind: 'prop', name: 'renders'}, true)).toBe(false);
  expect(
    setBreakpoint(
      document.createElement('div'),
      {kind: 'prop', name: 'x'},
      true
    )
  ).toBe(false);
  const own = () => 'mine';
  Object.defineProperty(el, 'update', {value: own, configurable: true});
  expect(setBreakpoint(el, {kind: 'method', name: 'update'}, true)).toBe(false);
  setBreakpoint(el, {kind: 'method', name: 'update'}, false);
  expect((el as unknown as {update: unknown}).update).toBe(own);
});

test('clearing removes every wrapper', () => {
  const el = make();
  setBreakpoint(el, {kind: 'method', name: 'update'}, true);
  setBreakpoint(el, {kind: 'prop', name: 'count'}, true);
  clearBreakpoints();
  expect(Object.hasOwn(el, 'update')).toBe(false);
  expect(Object.hasOwn(el, 'requestUpdate')).toBe(false);
});
