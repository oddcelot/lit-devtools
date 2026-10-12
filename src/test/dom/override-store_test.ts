import {afterEach, describe, expect, test, vi} from 'vite-plus/test';
import {
  deepElements,
  keyOf,
  matchesKey,
} from '../../lib/runtime/inspector/element-key.js';

const CALL_SITE_ATTR = 'data-lit-source';
const KEY = 'lit-devtools-overrides';

let n = 0;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('element keys', () => {
  test('a stamped element is its site and its place among that site', () => {
    document.body.innerHTML = `
      <div><x-row data-lit-source="/a.ts:1:1"></x-row></div>
      <x-row data-lit-source="/a.ts:1:1"></x-row>
      <x-row data-lit-source="/b.ts:2:2"></x-row>`;
    const [a, b, c] = document.querySelectorAll('x-row');
    expect(keyOf(b!)).toEqual({tag: 'x-row', site: '/a.ts:1:1', nth: 1});
    expect(keyOf(c!)).toEqual({tag: 'x-row', site: '/b.ts:2:2', nth: 0});
    expect(matchesKey(a!, keyOf(a!))).toBe(true);
    expect(matchesKey(a!, keyOf(b!))).toBe(false);
  });

  test('an unstamped element is its path, through shadow roots', () => {
    document.body.innerHTML = '<p></p><x-host></x-host>';
    const host = document.querySelector('x-host')!;
    const root = host.attachShadow({mode: 'open'});
    root.innerHTML = '<span></span><x-inner></x-inner>';
    const inner = root.querySelector('x-inner')!;
    const key = keyOf(inner);
    expect(key.tag).toBe('x-inner');
    expect(key.path).toMatch(/\/1\/s\/1$/);
    expect(matchesKey(inner, key)).toBe(true);
    expect([...deepElements(document.body)].includes(inner)).toBe(true);
  });
});

/** A fresh runtime graph (store, layers, Lit) over `saved`. */
const boot = async (saved: unknown[] = []) => {
  vi.resetModules();
  const data = new Map([[KEY, JSON.stringify({[location.pathname]: saved})]]);
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  const {LitElement, html} = await import('lit');
  const collect = await import('../../lib/runtime/inspector/collect.js');
  const store = await import('../../lib/runtime/inspector/override-store.js');
  const props = await import('../../lib/runtime/inspector/prop-overrides.js');
  store.installOverrideStore(storage, collect.setProp);
  const renders: string[] = [];
  /** Defines `tag`, rendering `label`, and records each render. */
  const define = (tag: string) => {
    class El extends LitElement {
      static override properties = {
        label: {},
        count: {type: Number},
        cfg: {attribute: false},
      };
      declare label: string;
      declare count: number;
      declare cfg: {theme: string};
      constructor() {
        super();
        this.label = 'intrinsic';
        this.count = 1;
        this.cfg = {theme: 'light'};
      }
      override render() {
        renders.push(`${this.label}/${this.count}/${this.cfg.theme}`);
        return html`${this.label}`;
      }
    }
    customElements.define(tag, El);
  };
  /** Mounts a stamped `tag` and waits for its first update. */
  const mount = async (tag: string, site: string) => {
    const el = document.createElement(tag) as HTMLElement & {
      updateComplete: Promise<unknown>;
      label: string;
      count: number;
      cfg: {theme: string};
    };
    el.setAttribute(CALL_SITE_ATTR, site);
    document.body.append(el);
    await el.updateComplete;
    return el;
  };
  const stored = () =>
    (JSON.parse(data.get(KEY) ?? '{}') as Record<string, unknown[]>)[
      location.pathname
    ] ?? [];
  const leaves = await import('../../lib/runtime/inspector/leaf-overrides.js');
  return {store, props, leaves, collect, define, mount, renders, stored};
};

const SITE = '/src/app.ts:4:7';

describe('override store', () => {
  test('a saved override is on from the first render', async () => {
    const tag = `x-saved-${n++}`;
    const {define, mount, renders, store, props} = await boot([
      {
        key: {tag, site: SITE, nth: 0},
        name: 'label',
        value: 'saved',
        enabled: true,
      },
      {key: {tag, site: SITE, nth: 0}, name: 'count', value: 5, enabled: false},
    ]);
    expect(store.waitingCount()).toBe(2);
    define(tag);
    const el = await mount(tag, SITE);
    expect(renders).toEqual(['saved/1/light']);
    expect(props.overrideOf(el, 'label')).toMatchObject({
      value: 'saved',
      persist: true,
      intrinsic: 'intrinsic',
    });
    // Restored as it was saved: switched off.
    expect(props.overrideOf(el, 'count')).toMatchObject({
      value: 5,
      enabled: false,
    });
    expect(store.waitingCount()).toBe(0);
  });

  test('a saved override that no longer fits is dropped and reported', async () => {
    const tag = `x-saved-${n++}`;
    const {define, mount, store, collect} = await boot([
      {
        key: {tag, site: SITE, nth: 0},
        name: 'count',
        value: 'five',
        enabled: true,
      },
      {key: {tag, site: SITE, nth: 0}, name: 'gone', value: 1, enabled: true},
    ]);
    define(tag);
    await mount(tag, SITE);
    expect(store.waitingCount()).toBe(0);
    expect(collect.collectOverrides().dropped).toMatchObject([
      {tagName: tag, name: 'count', reason: 'refused'},
      {tagName: tag, name: 'gone', reason: 'refused'},
    ]);
  });

  test('only overrides marked to persist are saved; waiting ones are kept', async () => {
    const tag = `x-saved-${n++}`;
    const other = {
      key: {tag: 'x-elsewhere', path: '0/1/9'},
      name: 'label',
      value: 'later',
      enabled: true,
    };
    const {define, mount, store, props, collect, stored} = await boot([other]);
    define(tag);
    const a = await mount(tag, SITE);
    const b = await mount(tag, SITE);
    collect.setProp(a, 'label', 'kept');
    collect.setProp(b, 'label', 'not kept');
    props.persistOverride(a, 'label', true);
    store.saveOverrides();
    expect(stored()).toEqual([
      {
        key: {tag, site: SITE, nth: 0},
        name: 'label',
        value: 'kept',
        enabled: true,
      },
      other,
    ]);
    expect(collect.collectOverrides().waiting).toBe(1);
    store.forgetWaiting();
    expect(stored()).toHaveLength(1);
  });

  test('a leaf override is saved with its keys and comes back', async () => {
    const tag = `x-saved-${n++}`;
    const first = await boot();
    first.define(tag);
    const el = await first.mount(tag, SITE);
    first.collect.setProp(el, 'cfg', 'dark', ['theme']);
    first.leaves.persistLeafOverride(el, 'cfg', ['theme'], true);
    first.store.saveOverrides();
    const saved = first.stored();
    expect(saved).toEqual([
      {
        key: {tag, site: SITE, nth: 0},
        name: 'cfg',
        keys: ['theme'],
        value: 'dark',
        enabled: true,
      },
    ]);
    el.remove();

    // The next load: a new tag stands in for the reloaded class.
    const again = `x-saved-${n++}`;
    const second = await boot([
      {...(saved[0] as object), key: {tag: again, site: SITE, nth: 0}},
    ]);
    second.define(again);
    const back = await second.mount(again, SITE);
    expect(back.cfg.theme).toBe('dark');
    expect(second.renders).toEqual(['intrinsic/1/dark']);
  });
});
