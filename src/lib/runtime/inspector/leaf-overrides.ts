/**
 * The override layer for leaves inside a property's value: a string, number
 * or boolean in an object, array or `Map` the property holds. The leaf is
 * written in the live container, as a plain nested edit is, but the value it
 * replaced is kept, so switching the override off writes it back.
 *
 * There is no accessor to hear the app on a container's slot, so the layer
 * checks instead. Switching off writes the original back only while the slot
 * still holds the override; anything else there is the app's, and stays. An
 * override whose container the app replaced (the property, or an object on
 * the way down, now holds another one) no longer applies: it is dropped, its
 * old container handed its original back, and the drop is kept for the panel
 * to report.
 *
 * Shares the global switch with `prop-overrides.ts`: {@link reapplyLeaves}
 * follows it.
 */

import {stepInto, writeInto} from './inspect-value.js';
import {overridesApplied} from './prop-overrides.js';
import type {ValueSegment} from '../../../types/inspector.js';

type Leaf = string | number | boolean;

interface LeafSlot {
  name: string;
  keys: ValueSegment[];
  container: object;
  override: Leaf;
  enabled: boolean;
  /** Whether the override is what the container holds now. */
  written: boolean;
  /** The leaf's value from before the override, written back when it goes. */
  original: unknown;
}

interface Updatable extends Element {
  requestUpdate?: (name?: PropertyKey, old?: unknown) => void;
}

/** One leaf override, for the panel's list. */
export interface LeafOverrideRecord {
  el: Element;
  name: string;
  keys: ValueSegment[];
  value: Leaf;
  enabled: boolean;
}

/** A leaf override as an expanded level describes it. */
export interface LeafOverrideState {
  value: Leaf;
  enabled: boolean;
  /** The value the leaf holds, or would hold, without the override. */
  intrinsic: unknown;
}

const leaves = new WeakMap<Element, Map<string, LeafSlot>>();
// As in prop-overrides.ts: the elements `leaves` holds, without keeping
// them alive.
const holders = new Set<WeakRef<Element>>();
let dropped: LeafOverrideRecord[] = [];

const keyOf = (name: string, keys: readonly ValueSegment[]): string =>
  JSON.stringify([name, ...keys]);

const lastOf = (slot: LeafSlot): ValueSegment => slot.keys.at(-1)!;

/** The container `keys` ends in, below property `name`, as it is now. */
const containerAt = (
  el: Element,
  name: string,
  keys: readonly ValueSegment[]
): object | undefined => {
  let at: {value: unknown} | undefined;
  try {
    at = {value: (el as unknown as Record<string, unknown>)[name]};
    for (const key of keys.slice(0, -1)) {
      if (at === undefined) return undefined;
      at = stepInto(at.value, key);
    }
  } catch {
    return undefined;
  }
  const value = at?.value;
  return typeof value === 'object' && value !== null ? value : undefined;
};

const readLeaf = (slot: LeafSlot): unknown =>
  stepInto(slot.container, lastOf(slot))?.value;

const writeLeaf = (slot: LeafSlot, value: unknown): boolean =>
  (typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean') &&
  writeInto(slot.container, lastOf(slot), value);

/**
 * Make the container hold what `slot` says it should: the override while it
 * is on and overrides apply, else the original, unless the app wrote the
 * slot since.
 */
const sync = (slot: LeafSlot): void => {
  const on = overridesApplied() && slot.enabled;
  if (on) {
    if (!slot.written) slot.original = readLeaf(slot);
    slot.written = writeLeaf(slot, slot.override);
  } else if (slot.written) {
    if (Object.is(readLeaf(slot), slot.override)) {
      writeLeaf(slot, slot.original);
    }
    slot.written = false;
  }
};

/** The reference is unchanged, so `hasChanged` needs an old value of none. */
const render = (el: Element, name: string): void => {
  const re = el as Updatable;
  if (typeof re.requestUpdate === 'function') re.requestUpdate(name, undefined);
};

const forget = (el: Element, key: string): void => {
  const map = leaves.get(el);
  map?.delete(key);
  if (map !== undefined && map.size === 0) {
    leaves.delete(el);
    for (const ref of holders) if (ref.deref() === el) holders.delete(ref);
  }
};

/**
 * Drop each of `el`'s leaf overrides whose container the app replaced, and
 * remember the drops for {@link takeDropped}.
 */
const sweep = (el: Element): void => {
  const map = leaves.get(el);
  if (map === undefined) return;
  for (const [key, slot] of map) {
    if (containerAt(el, slot.name, slot.keys) === slot.container) continue;
    slot.enabled = false;
    // The old container may be shared, or come back: leave it as it was.
    sync(slot);
    forget(el, key);
    dropped.push({
      el,
      name: slot.name,
      keys: slot.keys,
      value: slot.override,
      enabled: false,
    });
  }
};

const live = (): Element[] => {
  const out: Element[] = [];
  for (const ref of holders) {
    const el = ref.deref();
    if (el === undefined) holders.delete(ref);
    else out.push(el);
  }
  return out;
};

/**
 * Override the leaf at `keys` below property `name` with `value`, switched
 * on, and ask for a render. False when the path does not end in a slot that
 * takes a value of that type (see `writeInto`).
 */
export const setLeafOverride = (
  el: Element,
  name: string,
  keys: ValueSegment[],
  value: Leaf
): boolean => {
  if (keys.length === 0) return false;
  sweep(el);
  const key = keyOf(name, keys);
  let slot = leaves.get(el)?.get(key);
  if (slot === undefined) {
    const container = containerAt(el, name, keys);
    if (container === undefined) return false;
    slot = {
      name,
      keys: [...keys],
      container,
      override: value,
      enabled: true,
      written: false,
      original: undefined,
    };
  }
  // Written straight away, so a refused value leaves no trace.
  const before = readLeaf(slot);
  if (!writeLeaf(slot, value)) return false;
  if (!slot.written) slot.original = before;
  Object.assign(slot, {override: value, enabled: true, written: true});
  let map = leaves.get(el);
  if (map === undefined) {
    map = new Map();
    leaves.set(el, map);
    holders.add(new WeakRef(el));
  }
  map.set(key, slot);
  // With the global switch off, the write is taken back at once.
  sync(slot);
  render(el, name);
  return true;
};

/** Turn a leaf override on or off, leaving it in the layer. */
export const toggleLeafOverride = (
  el: Element,
  name: string,
  keys: ValueSegment[],
  enabled: boolean
): boolean => {
  sweep(el);
  const slot = leaves.get(el)?.get(keyOf(name, keys));
  if (slot === undefined) return false;
  slot.enabled = enabled;
  sync(slot);
  render(el, name);
  return true;
};

/** Drop a leaf override, writing the original back if the slot still holds it. */
export const removeLeafOverride = (
  el: Element,
  name: string,
  keys: ValueSegment[]
): boolean => {
  sweep(el);
  const key = keyOf(name, keys);
  const slot = leaves.get(el)?.get(key);
  if (slot === undefined) return false;
  slot.enabled = false;
  sync(slot);
  forget(el, key);
  render(el, name);
  return true;
};

/** The override on the leaf at `keys` below `name`, if there is one. */
export const leafOverrideOf = (
  el: Element,
  name: string,
  keys: ValueSegment[]
): LeafOverrideState | undefined => {
  sweep(el);
  const slot = leaves.get(el)?.get(keyOf(name, keys));
  if (slot === undefined) return undefined;
  return {
    value: slot.override,
    enabled: slot.enabled,
    intrinsic: slot.written ? slot.original : readLeaf(slot),
  };
};

/** Every leaf override in the page, after dropping those that went stale. */
export const listLeafOverrides = (): LeafOverrideRecord[] => {
  const out: LeafOverrideRecord[] = [];
  for (const el of live()) {
    sweep(el);
    for (const slot of leaves.get(el)?.values() ?? []) {
      out.push({
        el,
        name: slot.name,
        keys: slot.keys,
        value: slot.override,
        enabled: slot.enabled,
      });
    }
  }
  return out;
};

/** Follow the global switch: write or withdraw every leaf override. */
export const reapplyLeaves = (): void => {
  for (const el of live()) {
    sweep(el);
    const names = new Set<string>();
    for (const slot of leaves.get(el)?.values() ?? []) {
      sync(slot);
      names.add(slot.name);
    }
    for (const name of names) render(el, name);
  }
};

/** Remove every leaf override in the page. */
export const clearLeafOverrides = (): void => {
  for (const {el, name, keys} of listLeafOverrides()) {
    removeLeafOverride(el, name, keys);
  }
};

/** Whether `el` has leaf overrides that went stale since they were listed. */
export const sweepLeaves = (el: Element): boolean => {
  const before = dropped.length;
  sweep(el);
  return dropped.length > before;
};

/** The overrides dropped since the last call, oldest first. */
export const takeDropped = (): LeafOverrideRecord[] => {
  const out = dropped;
  dropped = [];
  return out;
};
