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
 * Marks an element the renderer deferred. Its value is the JSON of the
 * properties to set before releasing it, or empty for an island, whose props
 * Astro hands to the client renderer itself.
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
 * The properties as JSON, for an element no island will hand them to.
 * Values JSON can't carry (functions, symbols, class instances other than
 * plain objects and arrays) are left out and named, for the caller to warn.
 */
export const encodeProperties = (
  properties: Record<string, unknown>
): {json: string; dropped: string[]} => {
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [name, value] of Object.entries(properties)) {
    if (isPlainData(value)) kept[name] = value;
    else dropped.push(name);
  }
  return {json: JSON.stringify(kept), dropped};
};

const isPlainData = (value: unknown): boolean => {
  if (value == null || isPrimitive(value)) return true;
  if (Array.isArray(value)) return value.every(isPlainData);
  if (typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every(isPlainData);
};
