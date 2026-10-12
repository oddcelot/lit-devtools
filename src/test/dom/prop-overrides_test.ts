import {LitElement, html, type PropertyDeclarations} from 'lit';
import {afterEach, describe, expect, test} from 'vite-plus/test';
import {
  collectDetails,
  collectOverrides,
  setProp,
} from '../../lib/runtime/inspector/collect.js';
import {
  applyOverrides,
  clearOverrides,
  overrideOf,
  removeOverride,
  setOverride,
  toggleOverride,
} from '../../lib/runtime/inspector/prop-overrides.js';

let counter = 0;
const uniqueTag = (prefix: string) => `${prefix}-${counter++}`;

/** A Lit element rendering its `label` and `count`, with `label` an attribute. */
const mount = async (
  props: PropertyDeclarations = {label: {}, count: {type: Number}}
): Promise<LitElement & Record<string, unknown>> => {
  const tag = uniqueTag('x-over');
  class El extends LitElement {
    static override properties = props;
    constructor() {
      super();
      (this as unknown as Record<string, unknown>)['label'] = 'intrinsic';
      (this as unknown as Record<string, unknown>)['count'] = 1;
    }
    override render() {
      const self = this as unknown as Record<string, unknown>;
      return html`${String(self['label'])}/${String(self['count'])}`;
    }
  }
  customElements.define(tag, El);
  const el = document.createElement(tag) as LitElement &
    Record<string, unknown>;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const shown = (el: LitElement): string =>
  (el.shadowRoot?.textContent ?? '').replace(/<!--.*?-->/g, '').trim();

afterEach(() => {
  clearOverrides();
  applyOverrides(true);
  document.body.innerHTML = '';
});

describe('override layer', () => {
  test('an override renders, and app writes land underneath it', async () => {
    const el = await mount();
    expect(setOverride(el, 'label', 'over')).toBe(true);
    await el.updateComplete;
    expect(el['label']).toBe('over');
    expect(shown(el)).toBe('over/1');

    el['label'] = 'from app';
    await el.updateComplete;
    expect(shown(el)).toBe('over/1');
    expect(overrideOf(el, 'label')).toEqual({
      value: 'over',
      enabled: true,
      intrinsic: 'from app',
    });

    toggleOverride(el, 'label', false);
    await el.updateComplete;
    expect(shown(el)).toBe('from app/1');

    // Off, app writes go straight through.
    el['label'] = 'again';
    await el.updateComplete;
    expect(shown(el)).toBe('again/1');

    toggleOverride(el, 'label', true);
    await el.updateComplete;
    expect(shown(el)).toBe('over/1');
  });

  test('an attribute change while overridden is the intrinsic value', async () => {
    const el = await mount();
    setOverride(el, 'label', 'over');
    el.setAttribute('label', 'attr');
    await el.updateComplete;
    expect(shown(el)).toBe('over/1');
    expect(overrideOf(el, 'label')?.intrinsic).toBe('attr');
  });

  test('removing the last override gives the property back', async () => {
    const el = await mount();
    setOverride(el, 'label', 'over');
    el['label'] = 'from app';
    expect(Object.getOwnPropertyDescriptor(el, 'label')).toBeDefined();
    expect(removeOverride(el, 'label')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(el, 'label')).toBeUndefined();
    await el.updateComplete;
    expect(shown(el)).toBe('from app/1');
    expect(overrideOf(el, 'label')).toBeUndefined();
    expect(removeOverride(el, 'label')).toBe(false);
    // Lit's accessor is back in charge.
    el['label'] = 'later';
    await el.updateComplete;
    expect(shown(el)).toBe('later/1');
  });

  test('the global switch suspends every override and keeps each one', async () => {
    const a = await mount();
    const b = await mount();
    setOverride(a, 'label', 'A');
    setOverride(b, 'count', 9);
    toggleOverride(b, 'count', false);
    applyOverrides(false);
    await Promise.all([a.updateComplete, b.updateComplete]);
    expect(shown(a)).toBe('intrinsic/1');
    expect(collectOverrides().applied).toBe(false);
    applyOverrides(true);
    await Promise.all([a.updateComplete, b.updateComplete]);
    expect(shown(a)).toBe('A/1');
    // Still off on its own.
    expect(shown(b)).toBe('intrinsic/1');
  });

  test('a noAccessor property is overridden and handed back', async () => {
    const el = await mount({label: {noAccessor: true}, count: {type: Number}});
    setOverride(el, 'label', 'over');
    await el.updateComplete;
    expect(shown(el)).toBe('over/1');
    el['label'] = 'from app';
    removeOverride(el, 'label');
    await el.updateComplete;
    expect(shown(el)).toBe('from app/1');
    expect(Object.getOwnPropertyDescriptor(el, 'label')?.value).toBe(
      'from app'
    );
  });

  test('a hand-written accessor still sees the effective value', async () => {
    const tag = uniqueTag('x-hand');
    const seen: unknown[] = [];
    class Hand extends LitElement {
      static override properties = {size: {noAccessor: true}};
      #size = 1;
      get size() {
        return this.#size;
      }
      set size(v: number) {
        seen.push(v);
        const old = this.#size;
        this.#size = v;
        this.requestUpdate('size', old);
      }
      override render() {
        return html`${this.size}`;
      }
    }
    customElements.define(tag, Hand);
    const el = document.createElement(tag) as Hand;
    document.body.append(el);
    await el.updateComplete;
    setOverride(el, 'size', 5);
    await el.updateComplete;
    expect(shown(el)).toBe('5');
    el.size = 2;
    expect(seen).toEqual([5]);
    removeOverride(el, 'size');
    await el.updateComplete;
    expect(shown(el)).toBe('2');
    expect(seen).toEqual([5, 2]);
  });

  test('a getter with no setter is refused', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'fixed', {get: () => 1, configurable: true});
    expect(setOverride(el, 'fixed', 2)).toBe(false);
    expect(overrideOf(el, 'fixed')).toBeUndefined();
  });
});

describe('overrides in the inspector', () => {
  test('setProp overrides a top-level property; details say so', async () => {
    const el = await mount();
    expect(setProp(el, 'label', 'over')).toBe(true);
    el['label'] = 'from app';
    const label = collectDetails(el).properties.find((p) => p.name === 'label');
    expect(label?.value).toBe('"over"');
    expect(label?.override).toEqual({
      value: '"over"',
      enabled: true,
      intrinsic: '"from app"',
    });
    toggleOverride(el, 'label', false);
    expect(
      collectDetails(el).properties.find((p) => p.name === 'label')?.value
    ).toBe('"from app"');
  });

  test('collectOverrides lists every override by element', async () => {
    const el = await mount();
    setProp(el, 'label', 'over');
    setProp(el, 'count', 3);
    toggleOverride(el, 'count', false);
    const {applied, entries} = collectOverrides();
    expect(applied).toBe(true);
    expect(entries).toEqual([
      {
        id: expect.any(Number),
        tagName: el.localName,
        name: 'label',
        value: '"over"',
        enabled: true,
      },
      {
        id: expect.any(Number),
        tagName: el.localName,
        name: 'count',
        value: '3',
        enabled: false,
      },
    ]);
    clearOverrides();
    expect(collectOverrides().entries).toEqual([]);
    await el.updateComplete;
    expect(shown(el)).toBe('intrinsic/1');
  });
});
