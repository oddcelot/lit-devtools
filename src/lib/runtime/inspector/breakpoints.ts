/**
 * Breakpoints on one element: pause in the debugger when it enters
 * `update()` or `render()`, or when one of its reactive properties changes.
 *
 * Each is an own property on the instance, shadowing the prototype's method
 * for this element alone, so other instances of the class run untouched and
 * disarming is a `delete`. The prototype method is looked up on every call,
 * so a hot-patched class still runs its new code. A property breakpoint wraps
 * `requestUpdate`, which Lit's accessor calls with the property's name and old
 * value after storing the new one: it covers `noAccessor` properties and
 * leaves the override layer's own accessors (`prop-overrides.ts`) alone.
 *
 * The pause is a `debugger` statement here, so it only stops while the
 * browser's DevTools are open on the page, which the extension's panel
 * guarantees. Stepping out of the wrapper reaches the element's own code, or
 * for a property, whatever set it.
 */

import type {BreakTarget} from '../../../types/inspector.js';

type Method = (this: Element, ...args: unknown[]) => unknown;

interface Armed {
  methods: Set<'update' | 'render'>;
  props: Set<string>;
}

interface Breakable extends Element {
  constructor: {
    elementProperties?: Map<PropertyKey, unknown>;
    getPropertyOptions?: (name: PropertyKey) => {
      hasChanged?: (value: unknown, old: unknown) => boolean;
    };
  };
}

/** Marks the wrappers this module installed, so it never deletes another's. */
const OURS = Symbol('lit-devtools-breakpoint');

/** Elements with something armed. Strong refs: the panel clears them. */
const armed = new Map<Element, Armed>();

const protoMethod = (el: Element, name: string): Method | undefined => {
  const fn = (Object.getPrototypeOf(el) as Record<string, unknown>)[name];
  return typeof fn === 'function' ? (fn as Method) : undefined;
};

/** Whether a property write is a change, as the element's own Lit decides. */
const changed = (el: Breakable, name: PropertyKey, old: unknown): boolean => {
  const value = (el as unknown as Record<PropertyKey, unknown>)[name];
  try {
    const hasChanged = el.constructor.getPropertyOptions?.(name)?.hasChanged;
    return hasChanged === undefined
      ? !Object.is(value, old)
      : hasChanged(value, old);
  } catch {
    return true;
  }
};

function pauseInMethod(this: Element, name: string, args: unknown[]): unknown {
  // What paused, for the Scope pane. Step into the call below for the
  // element's own method.
  const litBreakpoint = {element: this, method: name};
  void litBreakpoint;
  // oxlint-disable-next-line no-debugger -- the breakpoint itself
  debugger;
  return protoMethod(this, name)?.apply(this, args);
}

function pauseOnChange(
  this: Breakable,
  name: PropertyKey | undefined,
  old: unknown,
  rest: unknown[]
): unknown {
  if (
    name !== undefined &&
    armed.get(this)?.props.has(String(name)) === true &&
    changed(this, name, old)
  ) {
    // What paused, for the Scope pane. Step out to reach the code that set it.
    const litBreakpoint = {
      element: this,
      property: name,
      oldValue: old,
      newValue: (this as unknown as Record<PropertyKey, unknown>)[name],
    };
    void litBreakpoint;
    // oxlint-disable-next-line no-debugger -- the breakpoint itself
    debugger;
  }
  return protoMethod(this, 'requestUpdate')?.call(this, name, old, ...rest);
}

/** Whether `el[name]` is free for a wrapper, or already ours. */
const canWrap = (el: Element, name: string): boolean => {
  const own = Object.getOwnPropertyDescriptor(el, name);
  return own === undefined || (own.value as {[OURS]?: true})?.[OURS] === true;
};

const wrap = (el: Element, name: string, fn: Method): void => {
  if (Object.hasOwn(el, name)) return;
  Object.defineProperty(el, name, {
    value: Object.assign(fn, {[OURS]: true as const}),
    configurable: true,
    writable: true,
  });
};

const unwrap = (el: Element, name: string): void => {
  if (Object.hasOwn(el, name) && canWrap(el, name)) {
    delete (el as unknown as Record<string, unknown>)[name];
  }
};

const isBreakable = (el: Element): el is Breakable =>
  protoMethod(el, 'requestUpdate') !== undefined;

const arm = (el: Breakable, target: BreakTarget, state: Armed): boolean => {
  if (target.kind === 'method') {
    if (protoMethod(el, target.name) === undefined) return false;
    if (!canWrap(el, target.name)) return false;
    const name = target.name;
    wrap(el, name, function (this: Element, ...args) {
      return pauseInMethod.call(this, name, args);
    });
    state.methods.add(name);
    return true;
  }
  if (el.constructor.elementProperties?.has(target.name) !== true) return false;
  if (!canWrap(el, 'requestUpdate')) return false;
  wrap(el, 'requestUpdate', function (this: Element, ...args) {
    const [name, old, ...rest] = args as [PropertyKey | undefined, unknown];
    return pauseOnChange.call(this as Breakable, name, old, rest);
  });
  state.props.add(target.name);
  return true;
};

const disarm = (el: Element, target: BreakTarget, state: Armed): void => {
  if (target.kind === 'method') {
    state.methods.delete(target.name);
    unwrap(el, target.name);
  } else {
    state.props.delete(target.name);
    if (state.props.size === 0) unwrap(el, 'requestUpdate');
  }
};

/**
 * Arm or disarm `target` on `el`. False when it cannot be armed: `el` is not
 * a Lit element, the property is not declared, or something else already
 * owns that slot on the instance. Disarming always succeeds.
 */
export const setBreakpoint = (
  el: Element,
  target: BreakTarget,
  on: boolean
): boolean => {
  let state = armed.get(el);
  if (!on) {
    if (state !== undefined) {
      disarm(el, target, state);
      if (state.methods.size + state.props.size === 0) armed.delete(el);
    }
    return true;
  }
  if (!isBreakable(el)) return false;
  state ??= {methods: new Set(), props: new Set()};
  if (!arm(el, target, state)) return false;
  armed.set(el, state);
  return true;
};

/** Disarm every breakpoint on every element. */
export const clearBreakpoints = (): void => {
  for (const [el, state] of armed) {
    for (const name of state.methods) unwrap(el, name);
    if (state.props.size > 0) unwrap(el, 'requestUpdate');
  }
  armed.clear();
};
