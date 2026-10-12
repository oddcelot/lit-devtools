/**
 * The override layer: values the panel set on a component's reactive
 * properties, kept apart from the element's intrinsic value (what the element
 * and the app last set: field defaults, attribute conversion, parent
 * bindings), like a declaration toggled in the browser's Styles pane.
 *
 * An overridden property gets an own accessor on the instance. App writes
 * land in the intrinsic value and leave an enabled override in place; the
 * effective value (the override when it applies, else the intrinsic one) is
 * forwarded to the property's own storage, so rendering, `hasChanged` and
 * reflection carry on as before. Removing the last override on a property
 * takes the accessor away and hands the intrinsic value back.
 *
 * Mechanics only: what may be overridden, and with what, is for the caller
 * (`setProp` in `collect.ts`) to decide.
 */

/** Where a property keeps the value the element renders from. */
interface Backing {
  get(): unknown;
  set(value: unknown): void;
  /** Put back what the instance had before the override took over. */
  restore(intrinsic: unknown): void;
}

interface Slot {
  override: unknown;
  enabled: boolean;
  intrinsic: unknown;
  backing: Backing;
}

interface Updatable extends Element {
  requestUpdate?: (name?: PropertyKey, old?: unknown) => void;
}

/** One override in the page, for the panel's list. */
export interface OverrideRecord {
  el: Element;
  name: string;
  value: unknown;
  enabled: boolean;
}

/** An override as the details of its element describe it. */
export interface OverrideState {
  value: unknown;
  enabled: boolean;
  intrinsic: unknown;
}

const layers = new WeakMap<Element, Map<string, Slot>>();
// The elements `layers` holds, to list them; the WeakMap alone can't be
// iterated, and a removed element must not be kept alive for the list.
const holders = new Set<WeakRef<Element>>();
let applied = true;

const effectiveOf = (slot: Slot): unknown =>
  applied && slot.enabled ? slot.override : slot.intrinsic;

const accessorOf = (
  el: Element,
  name: string
): PropertyDescriptor | undefined => {
  for (
    let proto = Object.getPrototypeOf(el) as object | null;
    proto !== null;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc !== undefined) return desc;
  }
  return undefined;
};

/**
 * The storage the effective value is forwarded to. A value the instance holds
 * as an own data property (a `noAccessor` property, or a class field that
 * shadows Lit's accessor) moves into a variable here for as long as the
 * override lasts; a prototype accessor (Lit's, or one the class wrote) is
 * called. `undefined` when the property cannot be taken over: a getter with
 * no setter, or an own property that is not configurable.
 */
const backingOf = (el: Element, name: string): Backing | undefined => {
  const own = Object.getOwnPropertyDescriptor(el, name);
  if (own !== undefined) {
    if (own.configurable !== true || !('value' in own)) return undefined;
    let stored: unknown = own.value;
    return {
      get: () => stored,
      set: (v) => (stored = v),
      restore: (intrinsic) =>
        Object.defineProperty(el, name, {...own, value: intrinsic}),
    };
  }
  const desc = accessorOf(el, name);
  if (desc === undefined || 'value' in desc) {
    // Never set, or a data value on a prototype: an own data property is
    // what a plain assignment would have made.
    let stored: unknown = desc?.value;
    return {
      get: () => stored,
      set: (v) => (stored = v),
      restore: (intrinsic) =>
        Object.defineProperty(el, name, {
          value: intrinsic,
          writable: true,
          enumerable: true,
          configurable: true,
        }),
    };
  }
  if (desc.set === undefined) return undefined;
  const get = (): unknown => desc.get?.call(el);
  const set = (v: unknown): void => desc.set!.call(el, v);
  return {
    get,
    set,
    restore: (intrinsic) => {
      if (!Object.is(get(), intrinsic)) set(intrinsic);
    },
  };
};

const requestUpdate = (el: Element, name: string, old: unknown): void => {
  const re = el as Updatable;
  if (typeof re.requestUpdate === 'function') re.requestUpdate(name, old);
};

/**
 * Hand `slot`'s effective value to the element. `requestUpdate` follows for
 * a `noAccessor` property, or one with a custom `hasChanged`, which would not
 * schedule the render the change is for.
 */
const push = (el: Element, name: string, slot: Slot): void => {
  const old = slot.backing.get();
  const next = effectiveOf(slot);
  if (Object.is(old, next)) return;
  slot.backing.set(next);
  requestUpdate(el, name, old);
};

const install = (el: Element, name: string): Slot | undefined => {
  const backing = backingOf(el, name);
  if (backing === undefined) return undefined;
  const slot: Slot = {
    override: undefined,
    enabled: true,
    intrinsic: backing.get(),
    backing,
  };
  Object.defineProperty(el, name, {
    configurable: true,
    enumerable: true,
    get: () => backing.get(),
    set: (v: unknown) => {
      // An app write: the element's own intended value, under the override.
      slot.intrinsic = v;
      if (applied && slot.enabled) return;
      // As the write would have gone without the layer: an accessor renders
      // on its own, a plain field waits for the app to ask.
      backing.set(v);
    },
  });
  return slot;
};

const uninstall = (el: Element, name: string, slot: Slot): void => {
  const old = slot.backing.get();
  delete (el as unknown as Record<string, unknown>)[name];
  slot.backing.restore(slot.intrinsic);
  if (!Object.is(old, slot.intrinsic)) requestUpdate(el, name, old);
};

const slotOf = (el: Element, name: string): Slot | undefined =>
  layers.get(el)?.get(name);

/**
 * Override `name` on `el` with `value` and turn the override on, taking the
 * property over on its first one. False when the property cannot be taken
 * over (see {@link backingOf}), or the takeover threw.
 */
export const setOverride = (
  el: Element,
  name: string,
  value: unknown
): boolean => {
  try {
    let layer = layers.get(el);
    let slot = layer?.get(name);
    if (slot === undefined) {
      slot = install(el, name);
      if (slot === undefined) return false;
      if (layer === undefined) {
        layer = new Map();
        layers.set(el, layer);
        holders.add(new WeakRef(el));
      }
      layer.set(name, slot);
    }
    slot.override = value;
    slot.enabled = true;
    push(el, name, slot);
    return true;
  } catch {
    return false;
  }
};

/** Turn an existing override on or off, leaving it in the layer. */
export const toggleOverride = (
  el: Element,
  name: string,
  enabled: boolean
): boolean => {
  const slot = slotOf(el, name);
  if (slot === undefined) return false;
  slot.enabled = enabled;
  try {
    push(el, name, slot);
  } catch {
    // The element's own setter threw; the layer still records the choice.
  }
  return true;
};

/**
 * Drop the override on `name`, hand the element its intrinsic value, and give
 * the property back once nothing overrides it.
 */
export const removeOverride = (el: Element, name: string): boolean => {
  const layer = layers.get(el);
  const slot = layer?.get(name);
  if (layer === undefined || slot === undefined) return false;
  layer.delete(name);
  if (layer.size === 0) {
    layers.delete(el);
    for (const ref of holders) if (ref.deref() === el) holders.delete(ref);
  }
  try {
    uninstall(el, name, slot);
  } catch {
    // The element's own setter threw; the property is ours no longer.
  }
  return true;
};

/** The override on `name`, if there is one. */
export const overrideOf = (
  el: Element,
  name: string
): OverrideState | undefined => {
  const slot = slotOf(el, name);
  return slot === undefined
    ? undefined
    : {value: slot.override, enabled: slot.enabled, intrinsic: slot.intrinsic};
};

/** Every override in the page, element by element, oldest first. */
export const listOverrides = (): OverrideRecord[] => {
  const out: OverrideRecord[] = [];
  for (const ref of holders) {
    const el = ref.deref();
    const layer = el === undefined ? undefined : layers.get(el);
    if (el === undefined || layer === undefined) {
      holders.delete(ref);
      continue;
    }
    for (const [name, slot] of layer) {
      out.push({el, name, value: slot.override, enabled: slot.enabled});
    }
  }
  return out;
};

/** Whether overrides apply at all: the panel's global switch. */
export const overridesApplied = (): boolean => applied;

/**
 * Apply or suspend every override at once. Each keeps its own on/off, so
 * turning the switch back on restores exactly the ones that were on.
 */
export const applyOverrides = (on: boolean): void => {
  if (applied === on) return;
  applied = on;
  for (const {el, name} of listOverrides()) {
    const slot = slotOf(el, name)!;
    try {
      push(el, name, slot);
    } catch {
      // As in toggleOverride.
    }
  }
};

/** Remove every override in the page. */
export const clearOverrides = (): void => {
  for (const {el, name} of listOverrides()) removeOverride(el, name);
};
