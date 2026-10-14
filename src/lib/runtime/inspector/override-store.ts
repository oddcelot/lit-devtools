/**
 * Overrides kept across reloads: the ones marked to persist are saved, per
 * page path, and put back on the matching elements of the next load.
 *
 * Elements are found again by {@link keyOf}. A saved override goes back on
 * during the element's first update, from a one-shot reactive controller's
 * `hostUpdate`: after Lit's dev-mode check that no own property shadows a
 * reactive accessor (the override's accessor would trip it), before
 * `update` renders, so the first paint already shows it. Elements that had
 * rendered before the store was installed get theirs at once, at the cost of
 * a second render.
 *
 * A saved override that no longer fits (the property was renamed, or holds
 * another type now) is refused by the same guards a panel edit goes through,
 * and reported as dropped. One that finds no element stays waiting, since the
 * element may come later (a lazy route, a list that loads).
 *
 * Nothing is saved until {@link installOverrideStore} hands over a storage:
 * the dev-server hosts do, with the tab's `sessionStorage`; the browser
 * extension does not, as a page it visits never asked for its storage to be
 * written.
 */

import {
  deepElements,
  keyOf,
  matchesKey,
  type ElementKey,
} from './element-key.js';
import {
  listLeafOverrides,
  persistLeafOverride,
  toggleLeafOverride,
} from './leaf-overrides.js';
import {noteDrop} from './override-drops.js';
import {
  listOverrides,
  persistOverride,
  toggleOverride,
} from './prop-overrides.js';
import type {ValueSegment} from '../../../types/inspector.js';

/** sessionStorage key holding the saved overrides, by page path. */
export const OVERRIDES_SS_KEY = 'lit-devtools-overrides';

type Leaf = string | number | boolean;

/** One saved override. */
interface SavedOverride {
  key: ElementKey;
  name: string;
  keys?: ValueSegment[];
  value: Leaf;
  enabled: boolean;
}

/** Set an override with the panel's guards; true when it applied. */
export type ApplyOverride = (
  el: Element,
  name: string,
  value: Leaf,
  keys: ValueSegment[]
) => boolean;

interface LitLike extends Element {
  hasUpdated?: boolean;
  addController?: (c: object) => void;
  removeController?: (c: object) => void;
}

type Store = Record<string, SavedOverride[]>;

let storage: Pick<Storage, 'getItem' | 'setItem'> | null = null;
let apply: ApplyOverride | null = null;
// What storage holds, every path's, written back with this path's replaced.
let store: Store = {};
// Saved overrides not yet put back on an element, by path.
let pending: Store = {};
let restored: (() => void) | undefined;

const pathname = (): string => location.pathname;

/** The saved overrides of this path not yet put back on an element. */
const waiting = (): SavedOverride[] => pending[pathname()] ?? [];

const isLeaf = (v: unknown): v is Leaf =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

const parse = (json: string | null): Store => {
  try {
    const parsed: unknown = JSON.parse(json ?? '{}');
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Store)
      : {};
  } catch {
    return {};
  }
};

const read = (): Store => parse(storage?.getItem(OVERRIDES_SS_KEY) ?? null);

/**
 * Put one saved override back on `el` as it was saved, kept and switched on
 * or off; a refusal is reported as a drop.
 */
const restoreOne = (el: Element, r: SavedOverride): void => {
  const keys = r.keys ?? [];
  if (!isLeaf(r.value) || apply === null || !apply(el, r.name, r.value, keys)) {
    noteDrop({
      el,
      name: r.name,
      keys: r.keys,
      value: r.value,
      reason: 'refused',
    });
    return;
  }
  if (keys.length === 0) {
    persistOverride(el, r.name, true);
    if (!r.enabled) toggleOverride(el, r.name, false);
  } else {
    persistLeafOverride(el, r.name, keys, true);
    if (!r.enabled) toggleLeafOverride(el, r.name, keys, false);
  }
};

/** Put back each waiting override that names `el`; true if any did. */
const restore = (el: Element): boolean => {
  const all = waiting();
  const mine = all.filter(
    (r) => r.key.tag === el.localName && matchesKey(el, r.key)
  );
  if (mine.length === 0) return false;
  pending[pathname()] = all.filter((r) => !mine.includes(r));
  for (const r of mine) restoreOne(el, r);
  return true;
};

const restoreAndTell = (el: Element): void => {
  try {
    if (restore(el)) restored?.();
  } catch {
    // Never break the app's update over a saved override.
  }
};

/**
 * Put `el`'s saved overrides back from its first `hostUpdate`: past Lit's
 * check for shadowed accessors, ahead of the render.
 */
const restoreOnUpdate = (el: LitLike): void => {
  const once = {
    hostUpdate: () => {
      el.removeController?.(once);
      restoreAndTell(el);
    },
  };
  el.addController?.(once);
};

// Per install, not `Symbol.for`: only one store installs on a page, and one
// installed again from a fresh module graph must hook too.
const BRAND = Symbol('override-store');

/**
 * Hook the first update of every element of the Lit `sample` belongs to:
 * `performUpdate` lives on the shared ReactiveElement prototype.
 */
const hookFirstUpdates = (sample: object): void => {
  let owner: object | null = sample;
  while (owner !== null && !Object.hasOwn(owner, 'performUpdate')) {
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  if (owner === null || Object.hasOwn(owner, BRAND)) return;
  Object.defineProperty(owner, BRAND, {value: true});
  const proto = owner as {performUpdate: (this: LitLike) => unknown};
  const original = proto.performUpdate;
  proto.performUpdate = function (this: LitLike) {
    if (this.hasUpdated !== true && waiting().length > 0) restoreOnUpdate(this);
    return original.call(this);
  };
};

/**
 * Start keeping overrides in `into`, and put back the ones saved for this
 * path. `applyWith` is `setProp`, handed in so this module does not import
 * the inspector's answers.
 */
export const installOverrideStore = (
  into: Pick<Storage, 'getItem' | 'setItem'>,
  applyWith: ApplyOverride
): void => {
  if (storage !== null) return;
  storage = into;
  apply = applyWith;
  store = read();
  pending = read();
  const define = customElements.define.bind(customElements);
  customElements.define = (name, ctor, options) => {
    const proto = ctor?.prototype as object | undefined;
    if (proto !== undefined && 'performUpdate' in proto)
      hookFirstUpdates(proto);
    define(name, ctor, options);
  };
  restoreRendered();
};

/**
 * Hook every Lit element already on the page, and put saved overrides back
 * on those that have rendered: they are past their first update.
 */
const restoreRendered = (): void => {
  for (const el of deepElements(document)) {
    if (!('performUpdate' in el)) continue;
    hookFirstUpdates(el);
    if ((el as LitLike).hasUpdated === true) restoreAndTell(el);
  }
};

/**
 * Take saved overrides that arrive after install, for a host whose storage
 * answers asynchronously (the extension's). A path this load has saved to
 * already keeps what it saved. Elements that rendered before they arrived
 * get theirs now, at the cost of a second render.
 */
export const loadSaved = (json: string): void => {
  if (storage === null) return;
  const saved = parse(json);
  for (const [path, records] of Object.entries(saved)) {
    if (Object.hasOwn(store, path) || !Array.isArray(records)) continue;
    store[path] = records;
    pending[path] = [...(pending[path] ?? []), ...records];
  }
  restoreRendered();
};

/** Hear of overrides put back, so the panel can be told. One listener. */
export const onRestored = (listener: () => void): void => {
  restored = listener;
};

/** Whether overrides can be kept here at all. */
export const canPersist = (): boolean => storage !== null;

/** How many saved overrides for this path wait for an element. */
export const waitingCount = (): number =>
  storage === null ? 0 : waiting().length;

/**
 * Save the overrides marked to persist, with those still waiting, under this
 * path. An element no longer in the document has no key to save it under,
 * and its override goes.
 */
export const saveOverrides = (): void => {
  if (storage === null) return;
  const saved: SavedOverride[] = [];
  for (const o of listOverrides()) {
    if (!o.persist || !o.el.isConnected || !isLeaf(o.value)) continue;
    saved.push({
      key: keyOf(o.el),
      name: o.name,
      value: o.value,
      enabled: o.enabled,
    });
  }
  for (const o of listLeafOverrides()) {
    if (!o.persist || !o.el.isConnected) continue;
    saved.push({
      key: keyOf(o.el),
      name: o.name,
      keys: o.keys,
      value: o.value,
      enabled: o.enabled,
    });
  }
  const all = [...saved, ...waiting()];
  if (all.length > 0) store[pathname()] = all;
  else delete store[pathname()];
  try {
    storage.setItem(OVERRIDES_SS_KEY, JSON.stringify(store));
  } catch {
    // Storage full or gone: the overrides just won't come back.
  }
};

/** Forget the saved overrides still waiting for an element on this path. */
export const forgetWaiting = (): void => {
  delete pending[pathname()];
  saveOverrides();
};
