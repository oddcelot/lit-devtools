/**
 * The events a class fires, and what a listener receives from each: the
 * `@fires` tags of its comment, completed by the `this.dispatchEvent(new
 * …Event('name', …))` calls in its body.
 *
 * A dispatch gives the event's type when no tag does: `CustomEvent<T>`'s type
 * argument as written, else the shape of the `detail` object literal, each
 * key typed by the `this` field it reads or the literal it holds. There
 * is no type checker, so anything else in `detail` is `unknown`.
 */

import type {DocEntry} from '../../types/component-docs.js';
import {type Node, child, nameOf, nodes, stringLiteral, walk} from './ast.js';

/** Whether `node` is a `this.dispatchEvent(…)` call. */
const isThisDispatch = (node: Node): boolean => {
  if (node.type !== 'CallExpression') return false;
  const callee = child(node, 'callee');
  return (
    callee?.type === 'MemberExpression' &&
    child(callee, 'object')?.type === 'ThisExpression' &&
    nameOf(child(callee, 'property')) === 'dispatchEvent'
  );
};

/** The type a literal's source text has, or undefined for anything else. */
const literalType = (text: string | undefined): string | undefined => {
  if (text === undefined) return undefined;
  if (/^['"`]/.test(text)) return 'string';
  if (/^-?\d/.test(text)) return 'number';
  if (text === 'true' || text === 'false') return 'boolean';
  return undefined;
};

/** A field's type: its annotation, else its initializer's literal type. */
const fieldType = (code: string, field: Node): string | undefined => {
  const annotation = child(child(field, 'typeAnnotation'), 'typeAnnotation');
  if (annotation) return code.slice(annotation.start, annotation.end);
  const value = child(field, 'value');
  return value && literalType(code.slice(value.start, value.end));
};

/** What `this.name` holds, by name: public properties, then any field. */
type FieldTypes = (name: string | undefined) => string | undefined;

const fieldTypesOf = (
  code: string,
  cls: Node,
  properties: DocEntry[]
): FieldTypes => {
  const fields = nodes(child(cls, 'body')?.body).filter(
    (member) => member.type === 'PropertyDefinition'
  );
  return (name) => {
    const property = properties.find((entry) => entry.name === name);
    const fromDocs = property?.type ?? literalType(property?.default);
    if (fromDocs) return fromDocs;
    const field = fields.find((f) => nameOf(child(f, 'key')) === name);
    return field && fieldType(code, field);
  };
};

/** A `detail` value's type: a `this` field's, or a literal's. */
const valueType = (
  code: string,
  value: Node | undefined,
  fields: FieldTypes
): string => {
  if (
    value?.type === 'MemberExpression' &&
    child(value, 'object')?.type === 'ThisExpression'
  ) {
    return fields(nameOf(child(value, 'property'))) ?? 'unknown';
  }
  if (value?.type === 'Literal' || value?.type === 'TemplateLiteral') {
    return literalType(code.slice(value.start, value.end)) ?? 'unknown';
  }
  return 'unknown';
};

/** The shape of a `detail` object literal: `{id: string; price: number}`. */
const detailShape = (
  code: string,
  options: Node | undefined,
  fields: FieldTypes
): string | undefined => {
  const detail = nodes(options?.properties).find(
    (property) => nameOf(child(property, 'key')) === 'detail'
  );
  const value = child(detail, 'value');
  if (value === undefined) return undefined;
  if (value.type !== 'ObjectExpression') {
    // Nothing known about it says nothing more than plain CustomEvent.
    const type = valueType(code, value, fields);
    return type === 'unknown' ? undefined : type;
  }
  const keys = nodes(value.properties).flatMap((property) => {
    const key = nameOf(child(property, 'key'));
    if (key === undefined) return [];
    return [`${key}: ${valueType(code, child(property, 'value'), fields)}`];
  });
  return `{${keys.join('; ')}}`;
};

/** `new CustomEvent('name', …)` (or any `…Event`): its name and type. */
const constructedEvent = (
  code: string,
  node: Node | undefined,
  fields: FieldTypes
): DocEntry | undefined => {
  if (node?.type !== 'NewExpression') return undefined;
  const constructor = nameOf(child(node, 'callee'));
  const [nameArg, options] = nodes(node.arguments);
  const name = stringLiteral(nameArg);
  if (!constructor?.endsWith('Event') || name === undefined) return undefined;
  const typeArgument = nodes(child(node, 'typeArguments')?.params)[0];
  const detail = typeArgument
    ? code.slice(typeArgument.start, typeArgument.end)
    : constructor === 'CustomEvent'
      ? detailShape(code, options, fields)
      : undefined;
  return {name, type: detail ? `${constructor}<${detail}>` : constructor};
};

/**
 * The events the class dispatches itself, once each. An event built
 * elsewhere and passed in by variable isn't seen.
 */
const dispatchedEvents = (
  code: string,
  cls: Node,
  properties: DocEntry[]
): DocEntry[] => {
  const fields = fieldTypesOf(code, cls, properties);
  const found = new Map<string, DocEntry>();
  for (const node of walk(child(cls, 'body'))) {
    if (!isThisDispatch(node)) continue;
    const event = constructedEvent(code, nodes(node.arguments)[0], fields);
    if (event && !found.has(event.name)) found.set(event.name, event);
  }
  return [...found.values()];
};

/**
 * The tagged events, each given the dispatched type when its tag names
 * none, then the dispatched events no tag names.
 */
export const eventsOf = (
  code: string,
  cls: Node,
  tagged: DocEntry[],
  properties: DocEntry[]
): DocEntry[] => {
  const dispatched = dispatchedEvents(code, cls, properties);
  const typed = tagged.map((entry) => {
    const type = dispatched.find((event) => event.name === entry.name)?.type;
    return entry.type === undefined && type ? {...entry, type} : entry;
  });
  const named = new Set(tagged.map((entry) => entry.name));
  return [...typed, ...dispatched.filter((event) => !named.has(event.name))];
};
