import {afterEach, expect, test} from 'vite-plus/test';
import {HTMLElement, customElements as shim} from '@lit-labs/ssr-dom-shim';
import {allowServerRedefinition} from '../../lib/ssr-registry.js';

const global = globalThis as {customElements?: unknown};
const before = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
const env = process.env['NODE_ENV'];

afterEach(() => {
  if (before === undefined) delete global.customElements;
  else Object.defineProperty(globalThis, 'customElements', before);
  process.env['NODE_ENV'] = env;
});

test('a registry installed later accepts a second definition, which wins', () => {
  // The shim throws on a repeat under anything but `development`.
  process.env['NODE_ENV'] = 'test';
  delete global.customElements;
  allowServerRedefinition();
  global.customElements ??= shim;
  const registry = global.customElements as typeof shim;
  class First extends HTMLElement {}
  class Second extends HTMLElement {}
  const tag = `x-redefined-${Date.now()}`;
  registry.define(tag, First as never);
  expect(() => registry.define(tag, Second as never)).not.toThrow();
  expect(registry.get(tag)).toBe(Second);
  expect(registry.getName(First as never)).toBeNull();
});

test('a constructor defined under two names still throws', () => {
  process.env['NODE_ENV'] = 'test';
  delete global.customElements;
  allowServerRedefinition();
  global.customElements ??= shim;
  const registry = global.customElements as typeof shim;
  class Once extends HTMLElement {}
  registry.define(`x-a-${Date.now()}`, Once as never);
  expect(() => registry.define(`x-b-${Date.now()}`, Once as never)).toThrow();
});
