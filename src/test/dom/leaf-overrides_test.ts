import {afterEach, describe, expect, test} from 'vite-plus/test';
import {
  collectOverrides,
  expandPath,
  setProp,
} from '../../lib/runtime/inspector/collect.js';
import {
  clearLeafOverrides,
  leafOverrideOf,
  listLeafOverrides,
  reapplyLeaves,
  removeLeafOverride,
  setLeafOverride,
  sweepLeaves,
  toggleLeafOverride,
} from '../../lib/runtime/inspector/leaf-overrides.js';
import {applyOverrides} from '../../lib/runtime/inspector/prop-overrides.js';

let counter = 0;

interface Cfg {
  theme: {mode: string};
  list: number[];
  flags: Map<string, boolean>;
}

/** A ReactiveElement look-alike holding `cfg`, recording render requests. */
const make = () => {
  const tag = `x-leaf-${counter++}`;
  const asked: unknown[][] = [];
  class El extends HTMLElement {
    static elementProperties = new Map([['cfg', {}]]);
    cfg: Cfg = {
      theme: {mode: 'light'},
      list: [1, 2],
      flags: new Map([['dense', false]]),
    };
    requestUpdate(name?: string, old?: unknown) {
      asked.push([name, old]);
    }
  }
  customElements.define(tag, El);
  const el = document.createElement(tag) as InstanceType<typeof El>;
  document.body.append(el);
  return {el, asked};
};

afterEach(() => {
  clearLeafOverrides();
  applyOverrides(true);
  reapplyLeaves();
  collectOverrides();
  document.body.innerHTML = '';
});

describe('leaf overrides', () => {
  test('switching off writes the original back, on writes the override', () => {
    const {el, asked} = make();
    const theme = el.cfg.theme;
    expect(setLeafOverride(el, 'cfg', ['theme', 'mode'], 'dark')).toBe(true);
    expect(el.cfg.theme).toBe(theme);
    expect(theme.mode).toBe('dark');
    expect(asked).toEqual([['cfg', undefined]]);
    expect(leafOverrideOf(el, 'cfg', ['theme', 'mode'])).toEqual({
      value: 'dark',
      enabled: true,
      intrinsic: 'light',
    });

    toggleLeafOverride(el, 'cfg', ['theme', 'mode'], false);
    expect(theme.mode).toBe('light');
    toggleLeafOverride(el, 'cfg', ['theme', 'mode'], true);
    expect(theme.mode).toBe('dark');
    removeLeafOverride(el, 'cfg', ['theme', 'mode']);
    expect(theme.mode).toBe('light');
    expect(leafOverrideOf(el, 'cfg', ['theme', 'mode'])).toBeUndefined();
  });

  test('an app write to the slot is kept when the override goes', () => {
    const {el} = make();
    setLeafOverride(el, 'cfg', ['list', 1], 7);
    el.cfg.list[1] = 3;
    toggleLeafOverride(el, 'cfg', ['list', 1], false);
    expect(el.cfg.list[1]).toBe(3);
    // Switched back on, the override covers the app's value, and it returns.
    toggleLeafOverride(el, 'cfg', ['list', 1], true);
    expect(el.cfg.list[1]).toBe(7);
    toggleLeafOverride(el, 'cfg', ['list', 1], false);
    expect(el.cfg.list[1]).toBe(3);
  });

  test('covers Map entries, by position', () => {
    const {el} = make();
    setLeafOverride(el, 'cfg', ['flags', 0], true);
    expect(el.cfg.flags.get('dense')).toBe(true);
    toggleLeafOverride(el, 'cfg', ['flags', 0], false);
    expect(el.cfg.flags.get('dense')).toBe(false);
  });

  test('refuses a path or value that does not fit, leaving nothing', () => {
    const {el} = make();
    expect(setLeafOverride(el, 'cfg', ['theme', 'mode'], 3)).toBe(false);
    expect(setLeafOverride(el, 'cfg', ['gone', 'x'], 'y')).toBe(false);
    expect(setLeafOverride(el, 'cfg', [], 'y')).toBe(false);
    expect(listLeafOverrides()).toEqual([]);
    expect(el.cfg.theme.mode).toBe('light');
  });

  test('the global switch withdraws and restores leaf overrides', () => {
    const {el} = make();
    setLeafOverride(el, 'cfg', ['theme', 'mode'], 'dark');
    applyOverrides(false);
    reapplyLeaves();
    expect(el.cfg.theme.mode).toBe('light');
    // Set while switched off: kept, not written.
    setLeafOverride(el, 'cfg', ['list', 0], 9);
    expect(el.cfg.list[0]).toBe(1);
    applyOverrides(true);
    reapplyLeaves();
    expect(el.cfg.theme.mode).toBe('dark');
    expect(el.cfg.list[0]).toBe(9);
  });

  test('replacing the object drops the override and reports it once', () => {
    const {el} = make();
    const old = el.cfg.theme;
    setLeafOverride(el, 'cfg', ['theme', 'mode'], 'dark');
    el.cfg = {...el.cfg, theme: {mode: 'light'}};
    expect(sweepLeaves(el)).toBe(true);
    // The old object gets its original back.
    expect(old.mode).toBe('light');
    expect(listLeafOverrides()).toEqual([]);
    const first = collectOverrides();
    expect(first.dropped).toEqual([
      expect.objectContaining({
        name: 'cfg',
        keys: ['theme', 'mode'],
        value: '"dark"',
      }),
    ]);
    expect(collectOverrides().dropped).toBeUndefined();
  });
});

describe('leaf overrides in the inspector', () => {
  test('a keyed setProp is a leaf override, and the level shows it', () => {
    const {el} = make();
    expect(setProp(el, 'cfg', 'dark', ['theme', 'mode'])).toBe(true);
    const level = expandPath(el, {
      section: 'prop',
      name: 'cfg',
      keys: ['theme'],
    });
    expect(level?.children).toEqual([
      expect.objectContaining({
        label: 'mode',
        value: '"dark"',
        override: {value: '"dark"', enabled: true, intrinsic: '"light"'},
      }),
    ]);
    expect(collectOverrides().entries).toEqual([
      {
        id: expect.any(Number),
        tagName: el.localName,
        name: 'cfg',
        keys: ['theme', 'mode'],
        value: '"dark"',
        enabled: true,
      },
    ]);
  });
});
