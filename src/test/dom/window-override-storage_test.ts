import {afterEach, expect, test, vi} from 'vite-plus/test';

const SOURCE = '@oddsquad/vite-plugin-lit#overrides';
let n = 0;

/** A window as the bridge uses it, with the relay played by the test. */
const fakeWindow = () => {
  const posted: Array<Record<string, unknown>> = [];
  const listeners: Array<(e: MessageEvent) => void> = [];
  const target = {
    postMessage: (data: Record<string, unknown>) => void posted.push(data),
    addEventListener: (_: string, fn: (e: MessageEvent) => void) =>
      void listeners.push(fn),
  };
  const deliver = (data: unknown, source: unknown = target) => {
    for (const fn of listeners) fn({source, data} as MessageEvent);
  };
  return {target: target as unknown as Window, posted, deliver};
};

afterEach(() => {
  document.body.innerHTML = '';
});

const boot = async () => {
  vi.resetModules();
  const {LitElement, html} = await import('lit');
  const bridge =
    await import('../../lib/runtime/inspector/window-override-storage.js');
  const collect = await import('../../lib/runtime/inspector/collect.js');
  const props = await import('../../lib/runtime/inspector/prop-overrides.js');
  const store = await import('../../lib/runtime/inspector/override-store.js');
  const tag = `x-bridged-${n++}`;
  class El extends LitElement {
    static override properties = {label: {}};
    declare label: string;
    constructor() {
      super();
      this.label = 'intrinsic';
    }
    override render() {
      return html`${this.label}`;
    }
  }
  customElements.define(tag, El);
  return {bridge, collect, props, store, tag};
};

test('asks for the saved overrides, and puts them on rendered elements', async () => {
  const {bridge, props, tag} = await boot();
  const el = document.createElement(tag) as HTMLElement & {
    label: string;
    updateComplete: Promise<unknown>;
  };
  document.body.append(el);
  await el.updateComplete;
  const win = fakeWindow();
  bridge.installWindowOverrideStore(win.target);
  expect(win.posted).toEqual([{source: SOURCE, type: 'want'}]);

  const {keyOf} = await import('../../lib/runtime/inspector/element-key.js');
  const record = {key: keyOf(el), name: 'label', value: 'saved', enabled: true};
  const json = JSON.stringify({[location.pathname]: [record]});
  // Another window's message, or a stranger's, is not the relay's.
  win.deliver({source: SOURCE, type: 'seed', json}, {});
  expect(el.label).toBe('intrinsic');
  win.deliver({source: SOURCE, type: 'seed', json});
  expect(el.label).toBe('saved');
  expect(props.overrideOf(el, 'label')?.persist).toBe(true);
});

test('holds saves until the seed is in, then sends them merged', async () => {
  const {bridge, collect, props, store, tag} = await boot();
  const win = fakeWindow();
  bridge.installWindowOverrideStore(win.target);
  const el = document.createElement(tag) as HTMLElement & {
    updateComplete: Promise<unknown>;
  };
  document.body.append(el);
  await el.updateComplete;
  collect.setProp(el, 'label', 'pinned');
  props.persistOverride(el, 'label', true);
  store.saveOverrides();
  expect(win.posted.filter((m) => m['type'] === 'save')).toEqual([]);

  const elsewhere = {
    '/other': [
      {key: {tag: 'x-a', path: '0'}, name: 'n', value: 1, enabled: true},
    ],
  };
  win.deliver({source: SOURCE, type: 'seed', json: JSON.stringify(elsewhere)});
  const saves = win.posted.filter((m) => m['type'] === 'save');
  expect(saves).toHaveLength(1);
  const saved = JSON.parse(saves[0]!['json'] as string) as Record<
    string,
    unknown[]
  >;
  expect(saved['/other']).toEqual(elsewhere['/other']);
  expect(saved[location.pathname]).toMatchObject([
    {name: 'label', value: 'pinned'},
  ]);
});
