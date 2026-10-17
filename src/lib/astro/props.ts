/**
 * How the Astro renderer hands an element its props, on the server and in
 * the browser alike. Dependency-free, so both sides import it.
 *
 * An attribute survives the trip in the HTML, and Lit reads it back into
 * its property when the element hydrates. A value that can't be an
 * attribute (an object, an array, or a property declared with
 * `attribute: false`) has to be set as a property instead, on the server for
 * the render and again in the browser before hydration, or the client's
 * first update would render without it and replace what the server sent.
 *
 * So an element that gets properties is rendered with `defer-hydration`,
 * and with {@link PROPS_ATTRIBUTE}, which says the renderer deferred it and
 * carries the values the browser needs. Only elements carrying it are
 * released by the renderer; a `defer-hydration` written by hand stays.
 */

/**
 * Marks an element the renderer deferred. Its value is the properties to
 * set before releasing it ({@link encodeProperties}), or empty for an
 * island, whose props Astro hands to the client renderer itself.
 */
export const PROPS_ATTRIBUTE = 'data-lit-props';

/** The slice of a Lit element class the split reads. */
export interface PropertyDeclarations {
  /** `ReactiveElement.elementProperties`: options keyed by property name. */
  elementProperties?: ReadonlyMap<PropertyKey, {attribute?: boolean | string}>;
  prototype?: object;
}

export interface SplitProps {
  /** Serialized for the HTML, as Lit would read them back. */
  attributes: Record<string, string>;
  /** Set on the instance: the server's render, then the browser's. */
  properties: Record<string, unknown>;
}

const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

/**
 * The attribute each reactive property reads, keyed by property name, or
 * `null` for a property declared with `attribute: false`.
 */
const attributeNames = (
  ctor: PropertyDeclarations
): Map<string, string | null> => {
  const names = new Map<string, string | null>();
  for (const [key, options] of ctor.elementProperties ?? []) {
    if (typeof key !== 'string') continue;
    // Lit lowercases the property name when `attribute` isn't a string.
    names.set(
      key,
      options.attribute === false
        ? null
        : typeof options.attribute === 'string'
          ? options.attribute
          : key.toLowerCase()
    );
  }
  return names;
};

/**
 * Splits the props an Astro page passes into attributes and properties.
 * A string, number or boolean is an attribute: under its own name, or under
 * the attribute of the reactive property it names (`fooBar` becomes
 * `foo-bar` when that is the property's attribute). `false`, `null` and
 * `undefined` leave it out, as Lit's boolean converter does. Anything else,
 * and any value for a property without an attribute or a plain class field,
 * is a property.
 */
export const splitProps = (
  ctor: PropertyDeclarations,
  props: Record<string, unknown>
): SplitProps => {
  const split: SplitProps = {attributes: {}, properties: {}};
  const attributeFor = attributeResolver(ctor);
  for (const [name, value] of Object.entries(props)) {
    place(split, name, value, attributeFor(name));
  }
  return split;
};

/**
 * The attribute a prop name sets: its own name when some property reads it
 * (a lowercase property is both), the attribute of the property it names,
 * `null` for a property without one or a plain class field, or else itself.
 */
const attributeResolver = (ctor: PropertyDeclarations) => {
  const byProperty = attributeNames(ctor);
  const read = new Set(byProperty.values());
  return (name: string): string | null => {
    if (read.has(name)) return name;
    if (byProperty.has(name)) return byProperty.get(name)!;
    return isField(ctor, name) ? null : name;
  };
};

const isField = (ctor: PropertyDeclarations, name: string): boolean =>
  ctor.prototype !== undefined && name in ctor.prototype;

/** An attribute's text, as Lit's converters read it back; none for off. */
const attributeText = (
  value: string | number | boolean | null | undefined
): string | undefined =>
  value === false || value == null
    ? undefined
    : value === true
      ? ''
      : String(value);

const place = (
  split: SplitProps,
  name: string,
  value: unknown,
  attribute: string | null
): void => {
  if (attribute === null || !(isPrimitive(value) || value == null)) {
    split.properties[name] = value;
    return;
  }
  const text = attributeText(value);
  if (text !== undefined) split.attributes[attribute] = text;
};

/**
 * Astro's tags for island props (`astro/runtime/server/serialize.js`): each
 * value travels as `[type, data]`. A plain tag carries its properties the
 * same way when JSON alone can't, so it takes the same types an island
 * does, and they come back the same: a `RegExp` without its flags, `NaN`
 * as `null`.
 */
const TYPE = {
  value: 0,
  array: 1,
  regExp: 2,
  date: 3,
  map: 4,
  set: 5,
  bigInt: 6,
  url: 7,
  uint8Array: 8,
  uint16Array: 9,
  uint32Array: 10,
  infinity: 11,
} as const;

type Tagged = [type: number, data?: unknown];

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/**
 * A value tagged as Astro tags it, or `undefined` for one it can't carry: a
 * function, a symbol, a class instance, or a cycle. Astro would flatten an
 * instance into a plain object; here it is left out, to be named.
 */
const tag = (value: unknown, seen: WeakSet<object>): Tagged | undefined => {
  if (value === undefined) return [TYPE.value];
  if (typeof value === 'number' && Math.abs(value) === Infinity) {
    return [TYPE.infinity, Math.sign(value)];
  }
  if (value === null || isPrimitive(value)) return [TYPE.value, value];
  if (typeof value === 'bigint') return [TYPE.bigInt, value.toString()];
  if (typeof value !== 'object' || seen.has(value)) return undefined;
  if (value instanceof Date) return [TYPE.date, value.toISOString()];
  if (value instanceof RegExp) return [TYPE.regExp, value.source];
  if (value instanceof URL) return [TYPE.url, value.href];
  if (value instanceof Uint8Array) return [TYPE.uint8Array, [...value]];
  if (value instanceof Uint16Array) return [TYPE.uint16Array, [...value]];
  if (value instanceof Uint32Array) return [TYPE.uint32Array, [...value]];
  seen.add(value);
  const tagged = tagContainer(value, seen);
  seen.delete(value);
  return tagged;
};

/** An array, `Map`, `Set` or plain object, its contents tagged in turn. */
const tagContainer = (
  value: object,
  seen: WeakSet<object>
): Tagged | undefined => {
  const all = (values: unknown[]): Tagged[] | undefined => {
    const out: Tagged[] = [];
    for (const item of values) {
      const tagged = tag(item, seen);
      if (tagged === undefined) return undefined;
      out.push(tagged);
    }
    return out;
  };
  const of = (type: number, values: unknown[]): Tagged | undefined => {
    const tagged = all(values);
    return tagged && [type, tagged];
  };
  if (Array.isArray(value)) return of(TYPE.array, value);
  if (value instanceof Map) return of(TYPE.map, [...value]);
  if (value instanceof Set) return of(TYPE.set, [...value]);
  if (!isPlainObject(value)) return undefined;
  const entries = Object.entries(value);
  const tagged = all(entries.map(([, item]) => item));
  return (
    tagged && [
      TYPE.value,
      Object.fromEntries(entries.map(([key], i) => [key, tagged[i]])),
    ]
  );
};

/** The value back from its tag, as Astro's `<astro-island>` reads it. */
const untag = ([type, data]: Tagged): unknown => {
  const list = () => (data as Tagged[]).map(untag);
  switch (type) {
    case TYPE.value:
      return typeof data === 'object' && data !== null
        ? Object.fromEntries(
            Object.entries(data).map(([key, item]) => [
              key,
              untag(item as Tagged),
            ])
          )
        : data;
    case TYPE.array:
      return list();
    case TYPE.regExp:
      return new RegExp(data as string);
    case TYPE.date:
      return new Date(data as string);
    case TYPE.map:
      return new Map(list() as [unknown, unknown][]);
    case TYPE.set:
      return new Set(list());
    case TYPE.bigInt:
      return BigInt(data as string);
    case TYPE.url:
      return new URL(data as string);
    case TYPE.uint8Array:
      return new Uint8Array(data as number[]);
    case TYPE.uint16Array:
      return new Uint16Array(data as number[]);
    case TYPE.uint32Array:
      return new Uint32Array(data as number[]);
    case TYPE.infinity:
      return Infinity * (data as number);
    default:
      return undefined;
  }
};

/** Whether JSON carries the value as it is: no tags needed. */
const isPlainJson = (value: unknown): boolean => {
  if (value === null || typeof value === 'string') return true;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlainJson);
  if (typeof value !== 'object' || !isPlainObject(value)) return false;
  return Object.values(value).every(isPlainJson);
};

/**
 * The properties for {@link PROPS_ATTRIBUTE}, for an element no island will
 * hand them to: plain JSON when that carries them all, else Astro's tags
 * for the whole object, a top-level array where plain JSON is an object.
 * Values neither can carry (functions, symbols, class instances, cycles)
 * are left out and named, for the caller to warn.
 */
export const encodeProperties = (
  properties: Record<string, unknown>
): {json: string; dropped: string[]} => {
  const kept: Record<string, unknown> = {};
  const tagged: Record<string, Tagged> = {};
  const dropped: string[] = [];
  for (const [name, value] of Object.entries(properties)) {
    const tagOf = tag(value, new WeakSet());
    if (tagOf === undefined) {
      dropped.push(name);
    } else {
      kept[name] = value;
      tagged[name] = tagOf;
    }
  }
  const json = isPlainJson(kept)
    ? JSON.stringify(kept)
    : JSON.stringify([TYPE.value, tagged]);
  return {json, dropped};
};

/** The properties {@link encodeProperties} wrote, back as values. */
export const decodeProperties = (json: string): Record<string, unknown> => {
  if (json === '') return {};
  const parsed = JSON.parse(json) as unknown;
  return (Array.isArray(parsed) ? untag(parsed as Tagged) : parsed) as Record<
    string,
    unknown
  >;
};
