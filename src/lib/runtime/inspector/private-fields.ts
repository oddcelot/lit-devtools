/**
 * A component's native `#private` fields, for the inspector's Private
 * section. A real `#private` field can't be read from outside its class, but
 * under the dev server the plugin's private-fields rewrite
 * (`../../plugins/private-fields.ts`) keys each one by
 * `Symbol.for('@oddsquad/vite-plugin-lit#private:<file>:<class>#<name>')`
 * instead, so an instance's private fields are own symbol-keyed properties.
 * Without the rewrite there are none, and nothing is shown.
 *
 * A field of a string, number or boolean can be set from the panel, as an
 * override (see `prop-overrides.ts`) named by the symbol's description: the
 * short name is not enough, as a base class and a subclass may both declare
 * `#x`.
 */

import {isExpandable} from './inspect-value.js';
import {overrideOf, setOverride} from './prop-overrides.js';
import {serialize, typeTag} from './serialize.js';
import {
  PRIVATE_KEY_PREFIX,
  type InspectorPrivateField,
} from '../../../types/inspector.js';

/** Most private fields reported for one element. */
const MAX_PRIVATE_FIELDS = 50;

/** A private field the rewrite made: its name and the class that declared it. */
interface PrivateKey {
  name: string;
  classKey: string;
}

/**
 * The private field `key` stands for, or `undefined` for any other symbol.
 * The name is what follows the last `#`; the class is between it and the
 * `:` before it.
 */
export const privateKeyOf = (key: symbol): PrivateKey | undefined => {
  const d = key.description;
  if (d === undefined || !d.startsWith(PRIVATE_KEY_PREFIX)) return undefined;
  const hash = d.lastIndexOf('#');
  if (hash < PRIVATE_KEY_PREFIX.length) return undefined;
  const name = d.slice(hash + 1);
  const head = d.slice(0, hash);
  return name === ''
    ? undefined
    : {name, classKey: head.slice(head.lastIndexOf(':') + 1)};
};

/** A private field as listed: shown name, full key, and live value. */
interface PrivateEntry {
  name: string;
  key: string;
  value: unknown;
}

type Primitive = string | number | boolean;

const isPrimitive = (v: unknown): v is Primitive =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/**
 * The live value of an own private field: its data value, or through the
 * accessor an override put there. `undefined` for anything else, such as an
 * accessor of the app's own.
 */
const ownValue = (el: Element, sym: symbol): {value: unknown} | undefined => {
  const desc = Object.getOwnPropertyDescriptor(el, sym);
  if (desc === undefined) return undefined;
  if ('value' in desc) return {value: desc.value};
  if (overrideOf(el, sym.description!) === undefined) return undefined;
  return {value: desc.get?.call(el)};
};

/**
 * The element's private data fields with the name each is shown by, in
 * definition order. Methods and accessors live on the prototype, but a
 * function stored in a field is skipped too: it is behaviour, not state.
 */
const privateEntries = (el: Element): PrivateEntry[] => {
  const out: PrivateEntry[] = [];
  const seen = new Set<string>();
  try {
    for (const sym of Object.getOwnPropertySymbols(el)) {
      if (out.length >= MAX_PRIVATE_FIELDS) break;
      const key = privateKeyOf(sym);
      if (key === undefined) continue;
      const own = ownValue(el, sym);
      if (own === undefined || typeof own.value === 'function') continue;
      // A subclass may declare a `#name` its superclass also has.
      const name = seen.has(key.name)
        ? `${key.name} (${key.classKey})`
        : key.name;
      seen.add(name);
      out.push({name, key: sym.description!, value: own.value});
    }
  } catch {
    // A hostile proxy; report what was read.
  }
  return out;
};

/** What the details say of a field's override, when it has one. */
const overrideField = (
  el: Element,
  key: string
): Pick<InspectorPrivateField, 'override'> => {
  const o = overrideOf(el, key);
  return o === undefined
    ? {}
    : {
        override: {
          value: serialize(o.value),
          enabled: o.enabled,
          ...(o.persist ? {persist: true} : {}),
          intrinsic: serialize(o.intrinsic),
        },
      };
};

/** The element's `#private` fields, serialized for the details pane. */
export const collectPrivateFields = (el: Element): InspectorPrivateField[] =>
  privateEntries(el).map(({name, key, value}) => ({
    name,
    key,
    value: serialize(value),
    type: typeTag(value),
    ...(isExpandable(value) ? {expandable: true} : {}),
    ...(isPrimitive(value)
      ? {
          editable: typeof value as NonNullable<
            InspectorPrivateField['editable']
          >,
        }
      : {}),
    ...overrideField(el, key),
  }));

/**
 * Answer a `set-prop` command for the private field `key` (a symbol
 * description, see {@link InspectorPrivateField.key}): override it with
 * `value`, then ask the element to update, as Lit does not watch private
 * fields. Only a field the element already holds as its own, whose value is
 * a primitive of the same type, is written: a command can neither add a
 * field nor change one's type. Returns whether it was applied.
 */
export const setPrivateField = (
  el: Element,
  key: string,
  value: Primitive
): boolean => {
  if (!key.startsWith(PRIVATE_KEY_PREFIX)) return false;
  const sym = Symbol.for(key);
  if (privateKeyOf(sym) === undefined) return false;
  let current: {value: unknown} | undefined;
  try {
    current = ownValue(el, sym);
  } catch {
    return false;
  }
  if (current === undefined || !isPrimitive(current.value)) return false;
  if (typeof value !== typeof current.value) return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  return setOverride(el, key, value);
};

/**
 * The live value of the private field shown as `name`, or `undefined` when
 * there is none.
 */
export const privateValue = (
  el: Element,
  name: string
): {value: unknown} | undefined => {
  const entry = privateEntries(el).find((e) => e.name === name);
  return entry === undefined ? undefined : {value: entry.value};
};
