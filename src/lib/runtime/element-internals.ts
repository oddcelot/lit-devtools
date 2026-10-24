/**
 * What each element keeps in its `ElementInternals`: custom states, the form
 * value and validity. Internals are private to the element that attached
 * them, so the only way to see them from outside is to be there when
 * `attachInternals()` hands them over. {@link installInternalsHook} wraps it
 * to keep each element's internals, and the calls that change them, in a
 * weak map; the element gets the same object back and behaves as before.
 *
 * Only elements that attach their internals after the hook is installed are
 * seen, so it runs ahead of the app: the dev server's head script, the
 * standalone script and the extension's `document_start` script install it.
 */

import {clip, isObject} from './live-reads.js';
import type {
  InspectorFormValue,
  InspectorInternals,
} from '../../types/inspector.js';

interface Tracked {
  internals: ElementInternals;
  /** The arguments of the last `setFormValue()` that went through. */
  form?: {value: unknown; state?: unknown};
  listeners: Set<() => void>;
}

/** Most `FormData` entries summarized; the rest are counted. */
const MAX_ENTRIES = 20;

const VALIDITY_FLAGS = [
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooLong',
  'tooShort',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
  'customError',
] as const;

// Shared through the global so that two runtimes on one page (the extension
// and the dev server's) read what whichever installed the hook recorded.
const STORE = Symbol.for('@oddsquad/vite-plugin-lit#element-internals');

const tracked = (): WeakMap<Element, Tracked> => {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[STORE];
  if (existing instanceof WeakMap) return existing as WeakMap<Element, Tracked>;
  const created = new WeakMap<Element, Tracked>();
  g[STORE] = created;
  return created;
};

/**
 * Replaces `target[name]` with an own, non-enumerable method that calls the
 * original and then `after` with its arguments. A call that throws throws as
 * before, without `after`.
 */
const wrapMethod = (
  target: object,
  name: string,
  after: (args: unknown[]) => void
): void => {
  const original = (target as Record<string, unknown>)[name];
  if (typeof original !== 'function') return;
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value(this: unknown, ...args: unknown[]): unknown {
      const result: unknown = original.apply(this, args);
      after(args);
      return result;
    },
  });
};

const track = (el: Element, internals: ElementInternals): void => {
  const entry: Tracked = {internals, listeners: new Set()};
  tracked().set(el, entry);
  const notify = (): void => {
    for (const listener of entry.listeners) {
      try {
        listener();
      } catch {
        // A listener's failure is not the element's.
      }
    }
  };
  wrapMethod(internals, 'setFormValue', (args) => {
    entry.form =
      args.length > 1 ? {value: args[0], state: args[1]} : {value: args[0]};
    notify();
  });
  wrapMethod(internals, 'setValidity', notify);
  const states: unknown = internals.states;
  if (isObject(states)) {
    for (const name of ['add', 'delete', 'clear']) {
      wrapMethod(states, name, notify);
    }
  }
};

const INSTALLED = Symbol.for(
  '@oddsquad/vite-plugin-lit#element-internals-hook'
);

/**
 * Wraps `HTMLElement.prototype.attachInternals` to track what each element
 * attaches. Idempotent across runtimes, and a no-op where there is no
 * `attachInternals`.
 */
export const installInternalsHook = (): void => {
  if (typeof HTMLElement === 'undefined') return;
  const proto = HTMLElement.prototype as HTMLElement & Record<symbol, unknown>;
  const desc = Object.getOwnPropertyDescriptor(proto, 'attachInternals');
  const original: unknown = desc?.value;
  if (typeof original !== 'function' || proto[INSTALLED] === true) return;
  Object.defineProperty(proto, INSTALLED, {value: true});
  // A function declaration keeps the name `attachInternals` on the wrapper.
  function attachInternals(this: HTMLElement): ElementInternals {
    const internals = (original as () => ElementInternals).call(this);
    try {
      track(this, internals);
    } catch {
      // Tracking is best-effort; the element gets its internals anyway.
    }
    return internals;
  }
  Object.defineProperty(proto, 'attachInternals', {
    ...desc,
    value: attachInternals,
  });
};

/**
 * Calls `onChange` after `el`'s custom states, form value or validity
 * change through its internals. Returns a function that stops it; a no-op
 * for an element with no tracked internals.
 */
export const onInternalsChange = (
  el: Element,
  onChange: () => void
): (() => void) => {
  const entry = tracked().get(el);
  if (entry === undefined) return () => {};
  entry.listeners.add(onChange);
  return () => entry.listeners.delete(onChange);
};

const fileOf = (v: File): InspectorFormValue => ({
  type: 'file',
  name: clip(v.name),
  size: v.size,
  mime: v.type,
});

const formDataOf = (v: FormData): InspectorFormValue => {
  const entries: Array<{name: string; value: InspectorFormValue}> = [];
  let total = 0;
  for (const [name, value] of v.entries()) {
    total++;
    if (entries.length < MAX_ENTRIES) {
      entries.push({name: clip(name), value: summarizeFormValue(value)});
    }
  }
  return total > entries.length
    ? {type: 'form-data', entries, more: total - entries.length}
    : {type: 'form-data', entries};
};

/**
 * A value `setFormValue()` takes, summarized for the panel. Anything else
 * reads as its string, as the browser would convert it.
 */
export const summarizeFormValue = (v: unknown): InspectorFormValue => {
  if (v === null || v === undefined) return {type: 'null'};
  if (typeof File !== 'undefined' && v instanceof File) return fileOf(v);
  if (typeof FormData !== 'undefined' && v instanceof FormData) {
    return formDataOf(v);
  }
  // The browser converts anything else with ToString, as `String` does.
  return {type: 'string', value: clip(String(v as string))};
};

/** The states in `internals`, or none when they cannot be read. */
const statesOf = (internals: ElementInternals): string[] => {
  try {
    return [...(internals.states as Iterable<unknown>)].map((s) =>
      clip(String(s))
    );
  } catch {
    return [];
  }
};

/** Validity of a form-associated element; `undefined` for any other. */
const validityOf = (
  internals: ElementInternals
): InspectorInternals['validity'] => {
  try {
    const validity = internals.validity;
    const flags = VALIDITY_FLAGS.filter((f) => validity[f] === true);
    return {
      valid: validity.valid,
      flags,
      message: internals.validationMessage,
    };
  } catch {
    // Not form-associated: reading validity throws.
    return undefined;
  }
};

/**
 * `el`'s custom states, form value and validity, read now; `undefined` for
 * an element whose internals the hook did not see. Never throws.
 */
export const readInternals = (el: Element): InspectorInternals | undefined => {
  const entry = tracked().get(el);
  if (entry === undefined) return undefined;
  const {internals, form} = entry;
  const validity = validityOf(internals);
  return {
    states: statesOf(internals),
    ...(form === undefined ? {} : {value: summarizeFormValue(form.value)}),
    ...(form !== undefined && 'state' in form
      ? {state: summarizeFormValue(form.state)}
      : {}),
    ...(validity === undefined ? {} : {validity}),
  };
};
