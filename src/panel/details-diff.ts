import type {InspectorDetails} from '../types/inspector.js';
import {internalsRows} from './internals-rows.js';

/**
 * The key a details row is known by across refreshes: its section and name.
 * Properties and `@state` share one namespace, as they do on the element.
 */
export const propKey = (name: string) => `p:${name}`;
export const attrKey = (name: string) => `a:${name}`;
export const extraKey = (name: string) => `e:${name}`;
export const internalsKey = (name: string) => `i:${name}`;

const rows = (d: InspectorDetails): Map<string, string> => {
  const m = new Map<string, string>();
  for (const p of d.properties) m.set(propKey(p.name), p.value);
  for (const a of d.attributes) m.set(attrKey(a.name), a.value);
  for (const e of d.extras ?? []) {
    m.set(extraKey(e.name), `${e.status ?? ''}\u0000${e.value}`);
  }
  if (d.internals !== undefined) {
    for (const r of internalsRows(d.internals)) {
      m.set(internalsKey(r.name), r.value);
    }
  }
  return m;
};

/**
 * Keys of the rows whose value differs between two snapshots of the same
 * element, including rows that just appeared. Empty when there is no earlier
 * snapshot or it was of another element: a fresh selection changed nothing.
 */
export const changedRows = (
  prev: InspectorDetails | null,
  next: InspectorDetails | null
): ReadonlySet<string> => {
  const changed = new Set<string>();
  if (prev === null || next === null || prev.id !== next.id) return changed;
  const before = rows(prev);
  for (const [key, value] of rows(next)) {
    if (before.get(key) !== value) changed.add(key);
  }
  return changed;
};
