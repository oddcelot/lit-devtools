/**
 * A component's native `#private` fields, for the inspector's Private
 * section. A real `#private` field can't be read from outside its class, but
 * under the dev server the plugin's private-fields rewrite
 * (`../../plugins/private-fields.ts`) keys each one by
 * `Symbol.for('@oddsquad/vite-plugin-lit#private:<file>:<class>#<name>')`
 * instead, so an instance's private fields are own symbol-keyed properties.
 * Without the rewrite there are none, and nothing is shown.
 */

import {isExpandable} from './inspect-value.js';
import {serialize, typeTag} from './serialize.js';
import type {InspectorPrivateField} from '../../../types/inspector.js';

/** What the rewrite's symbol descriptions start with; kept in step with it. */
const PRIVATE_KEY_PREFIX = '@oddsquad/vite-plugin-lit#private:';

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

/**
 * The element's private data fields with the name each is shown by, in
 * definition order. Methods and accessors live on the prototype, but a
 * function stored in a field is skipped too: it is behaviour, not state.
 */
const privateEntries = (el: Element): Array<{name: string; value: unknown}> => {
  const out: Array<{name: string; value: unknown}> = [];
  const seen = new Set<string>();
  try {
    for (const sym of Object.getOwnPropertySymbols(el)) {
      if (out.length >= MAX_PRIVATE_FIELDS) break;
      const key = privateKeyOf(sym);
      if (key === undefined) continue;
      const desc = Object.getOwnPropertyDescriptor(el, sym);
      if (desc === undefined || !('value' in desc)) continue;
      if (typeof desc.value === 'function') continue;
      // A subclass may declare a `#name` its superclass also has.
      const name = seen.has(key.name)
        ? `${key.name} (${key.classKey})`
        : key.name;
      seen.add(name);
      out.push({name, value: desc.value});
    }
  } catch {
    // A hostile proxy; report what was read.
  }
  return out;
};

/** The element's `#private` fields, serialized for the details pane. */
export const collectPrivateFields = (el: Element): InspectorPrivateField[] =>
  privateEntries(el).map(({name, value}) => ({
    name,
    value: serialize(value),
    type: typeTag(value),
    ...(isExpandable(value) ? {expandable: true} : {}),
  }));

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
