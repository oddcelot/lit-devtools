/**
 * One level of a value at a time, for the details pane's expandable rows:
 * whether a value has children, what they are, and how to step down a path
 * of keys to the value an `expand` command names. Runs in the inspected page
 * on live values, so it reads only own enumerable data the serializer would
 * read anyway, and never calls user functions beyond getters it already
 * guards.
 */
import {serialize, typeTag} from './serialize.js';
import type {ValueChild, ValueSegment} from '../../../types/inspector.js';

/** Most children listed per expanded level. */
export const MAX_CHILDREN = 100;

const isTemporal = (value: object): boolean => {
  const tag = (value as {[Symbol.toStringTag]?: unknown})[Symbol.toStringTag];
  return typeof tag === 'string' && tag.startsWith('Temporal.');
};

/** A typed array: indexable, but not `Array.isArray`. */
const isTypedArray = (value: object): value is {length: number} =>
  ArrayBuffer.isView(value) && !(value instanceof DataView);

/** A container whose children are worth listing. */
const isContainer = (value: unknown): value is object =>
  typeof value === 'object' &&
  value !== null &&
  !(value instanceof Node) &&
  !(value instanceof Date) &&
  !(value instanceof RegExp) &&
  !isTemporal(value);

/** Whether `value` has at least one child to list. Never throws. */
export const isExpandable = (value: unknown): boolean => {
  try {
    if (!isContainer(value)) return false;
    if (value instanceof Map || value instanceof Set) return value.size > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (isTypedArray(value)) return value.length > 0;
    return Object.keys(value).length > 0;
  } catch {
    return false;
  }
};

const read = (
  value: object,
  key: string | number
): {ok: true; value: unknown} | {ok: false} => {
  try {
    return {ok: true, value: (value as Record<string | number, unknown>)[key]};
  } catch {
    return {ok: false};
  }
};

const child = (
  label: string,
  key: ValueSegment,
  v: {ok: true; value: unknown} | {ok: false},
  entry = false,
  writable = false
): ValueChild => ({
  label,
  key,
  ...(entry ? {entry} : {}),
  value: v.ok ? serialize(v.value) : '[getter threw]',
  type: v.ok ? typeTag(v.value) : 'error',
  expandable: v.ok && isExpandable(v.value),
  ...(writable && v.ok ? editableOf(v.value) : {}),
});

/** The `editable` field for a primitive of an editable type, else nothing. */
const editableOf = (value: unknown): Pick<ValueChild, 'editable'> => {
  const t = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean'
    ? {editable: t}
    : {};
};

/** The first {@link MAX_CHILDREN} entries of a `Map`, keys serialised. */
const mapChildren = (map: Map<unknown, unknown>): ValueChild[] => {
  const children: ValueChild[] = [];
  let i = 0;
  for (const [k, v] of map) {
    if (i === MAX_CHILDREN) break;
    children.push(child(serialize(k), i, {ok: true, value: v}, true, true));
    i++;
  }
  return children;
};

/** The first {@link MAX_CHILDREN} members of a `Set`, numbered by order. */
const setChildren = (set: Set<unknown>): ValueChild[] => {
  const children: ValueChild[] = [];
  let i = 0;
  for (const item of set.values()) {
    if (i === MAX_CHILDREN) break;
    children.push(child(String(i), i, {ok: true, value: item}));
    i++;
  }
  return children;
};

/** The first {@link MAX_CHILDREN} elements of an array or typed array. */
const indexedChildren = (value: ArrayLike<unknown> & object): ValueChild[] => {
  const children: ValueChild[] = [];
  for (let i = 0; i < Math.min(value.length, MAX_CHILDREN); i++) {
    children.push(child(String(i), i, read(value, i), false, true));
  }
  return children;
};

/** The first {@link MAX_CHILDREN} own enumerable properties of `value`. */
const keyedChildren = (value: object, keys: string[]): ValueChild[] =>
  keys
    .slice(0, MAX_CHILDREN)
    .map((k) => child(k, k, read(value, k), false, true));

/**
 * The first {@link MAX_CHILDREN} children of `value`, and how many more
 * there are. A value with none gives an empty list.
 */
export const childrenOf = (
  value: unknown
): {children: ValueChild[]; more: number} => {
  if (!isContainer(value)) return {children: [], more: 0};
  let children: ValueChild[];
  let total: number;
  if (value instanceof Map) {
    children = mapChildren(value);
    total = value.size;
  } else if (value instanceof Set) {
    children = setChildren(value);
    total = value.size;
  } else if (Array.isArray(value) || isTypedArray(value)) {
    children = indexedChildren(value);
    total = value.length;
  } else {
    const keys = Object.keys(value);
    children = keyedChildren(value, keys);
    total = keys.length;
  }
  return {children, more: Math.max(0, total - children.length)};
};

/** The `index`th member of a `Map` or `Set`, or `undefined` past the end. */
const nthMember = (
  value: Map<unknown, unknown> | Set<unknown>,
  index: ValueSegment
): {value: unknown} | undefined => {
  if (typeof index !== 'number') return undefined;
  let i = 0;
  for (const item of value.values()) {
    if (i++ === index) return {value: item};
  }
  return undefined;
};

/** Whether `key` names an own slot of `value`, indexed or by property. */
const hasSlot = (value: object, key: ValueSegment): boolean => {
  const isIndexed = Array.isArray(value) || isTypedArray(value);
  if (isIndexed !== (typeof key === 'number')) return false;
  if (isIndexed) return (key as number) < (value as {length: number}).length;
  return Object.prototype.hasOwnProperty.call(value, key);
};

/**
 * The child of `value` that `key` names, as {@link childrenOf} numbered it,
 * or `undefined` when it does not resolve.
 */
export const stepInto = (
  value: unknown,
  key: ValueSegment
): {value: unknown} | undefined => {
  if (!isContainer(value)) return undefined;
  if (value instanceof Map || value instanceof Set) {
    return nthMember(value, key);
  }
  if (!hasSlot(value, key)) return undefined;
  const r = read(value, key);
  return r.ok ? {value: r.value} : undefined;
};

/** Assign `value` to `key` of an indexed or keyed `container`, same type. */
const writeSlot = (
  container: object,
  key: ValueSegment,
  value: string | number | boolean
): boolean => {
  if (!hasSlot(container, key)) return false;
  const slot = container as Record<string | number, unknown>;
  if (typeof slot[key] !== typeof value) return false;
  slot[key] = value;
  return true;
};

/**
 * Write the primitive `value` into the slot of `container` that `key` names,
 * as {@link childrenOf} numbered it: an object key, an array or typed array
 * index, or the position of a `Map` entry, whose value is replaced. Identity
 * is kept, as the container is changed in place. Only a slot already holding
 * a primitive of the same type is written, and a number must be finite.
 * A `Set` member has no slot, and a frozen container refuses; both give
 * false, as does anything that does not resolve. Never throws.
 */
export const writeInto = (
  container: unknown,
  key: ValueSegment,
  value: string | number | boolean
): boolean => {
  if (!isContainer(container)) return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  try {
    if (container instanceof Set) return false;
    if (container instanceof Map) {
      let i = 0;
      for (const [k, v] of container) {
        if (i++ !== key) continue;
        if (typeof v !== typeof value) return false;
        container.set(k, value);
        return true;
      }
      return false;
    }
    return writeSlot(container, key, value);
  } catch {
    return false;
  }
};
