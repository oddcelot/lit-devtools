/**
 * What a component's `@property()` and `@state()` declarations get wrong,
 * read from the class without a type checker:
 *
 * - `invalid-name`: an `attribute: '…'` HTML can't write, or one with
 *   capitals, which HTML lowercases so it never reaches the property.
 * - `property-type`: a `type` option that doesn't fit the field's annotation,
 *   or none on a number, boolean, array or object, whose attribute Lit then
 *   reads as a string. A `converter` or `attribute: false` is left alone.
 * - `property-visibility`: `@property()` on a private field, which makes
 *   internal state public API, and in TypeScript `@state()` on a public one.
 * - `shadowed-member`: a field named like a method every element has,
 *   `after` for `Element.after()`, or a member Lit relies on, `update`,
 *   which the field replaces. TypeScript reports the first in a typed file;
 *   nothing does in JavaScript.
 */

import {
  type Node,
  child,
  nameOf,
  nodes,
  nodesOf,
} from '../component-docs/ast.js';
import {parseModule} from '../component-docs/parse.js';
import type {Problem} from './diagnostics.js';
import {HTML_ELEMENT_METHODS, LIT_ELEMENT_MEMBERS} from './dom-properties.js';

const MEMBERS = new Set([
  'PropertyDefinition',
  'AccessorProperty',
  'MethodDefinition',
]);

interface Declared {
  member: Node;
  decorator: Node;
  kind: 'property' | 'state';
  options?: Node;
  name: string;
}

const declaredIn = (program: Node): Declared[] =>
  nodesOf(program).flatMap((member) => {
    if (!MEMBERS.has(member.type)) return [];
    const key = child(member, 'key');
    const name =
      key?.type === 'PrivateIdentifier' ? `#${String(key.name)}` : nameOf(key);
    return nodes(member.decorators).flatMap((decorator): Declared[] => {
      const call = child(decorator, 'expression');
      const kind = nameOf(child(call, 'callee'));
      if (!name || (kind !== 'property' && kind !== 'state')) return [];
      const options = nodes(call?.arguments)[0];
      return [
        {
          member,
          decorator,
          kind,
          name,
          ...(options?.type === 'ObjectExpression' ? {options} : {}),
        },
      ];
    });
  });

const optionOf = (options: Node | undefined, key: string) =>
  child(
    nodes(options?.properties).find(
      (p) => p.type === 'Property' && nameOf(child(p, 'key')) === key
    ),
    'value'
  );

// --- invalid-name ----------------------------------------------------------

const attributeNameProblem = ({options}: Declared): Problem | undefined => {
  const value = optionOf(options, 'attribute');
  if (value?.type !== 'Literal' || typeof value.value !== 'string')
    return undefined;
  const name = value.value;
  const at = {
    rule: 'invalid-name' as const,
    start: value.start,
    end: value.end,
  };
  const control = Array.from({length: name.length}, (_, i) =>
    name.charCodeAt(i)
  ).some((code) => code < 0x20);
  if (name === '' || control || /[\s"'>/=]/.test(name)) {
    return {
      ...at,
      message: `\`${name}\` isn't an attribute name HTML can write.`,
    };
  }
  if (/[A-Z]/.test(name)) {
    return {
      ...at,
      message: `HTML lowercases attribute names, so \`${name}\` arrives as \`${name.toLowerCase()}\` and never sets the property: write it in lowercase.`,
    };
  }
  return undefined;
};

// --- property-type ---------------------------------------------------------

type Converted = 'String' | 'Number' | 'Boolean' | 'Array' | 'Object';

const PART_KINDS: [RegExp, Converted][] = [
  [/^(string|(['"`]).*\2)$/, 'String'],
  [/^(number|-?\d[\d_.]*)$/, 'Number'],
  [/^(boolean|true|false)$/, 'Boolean'],
  [/^(readonly\s+)?.+\[\]$|^(Readonly)?Array<.+>$/, 'Array'],
  [/^\{[\s\S]*\}$|^Record<.+>$|^object$/, 'Object'],
];

/** What an annotation's attribute should convert to; undefined when it can't be told. */
const convertedOf = (annotation: string): Converted | undefined => {
  const parts = annotation
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'undefined' && part !== 'null');
  const kinds = new Set(
    parts.map((part) => PART_KINDS.find(([re]) => re.test(part))?.[1])
  );
  const [only] = kinds;
  return kinds.size === 1 && only ? only : undefined;
};

const SHAPE_TYPES: Record<string, string> = {
  ArrayExpression: 'unknown[]',
  ObjectExpression: '{}',
};

const LITERAL_TYPES = new Set(['number', 'boolean', 'string']);

/** An initializer's type, as the text of an annotation: `0` is `number`. */
const initializerType = (member: Node): string | undefined => {
  const value = child(member, 'value');
  if (!value) return undefined;
  if (value.type !== 'Literal') return SHAPE_TYPES[value.type];
  const type = typeof value.value;
  return LITERAL_TYPES.has(type) ? type : undefined;
};

/** The field's annotation, else what its literal initializer is. */
const annotationOf = (code: string, member: Node): string | undefined => {
  const annotation = child(child(member, 'typeAnnotation'), 'typeAnnotation');
  return annotation
    ? code.slice(annotation.start, annotation.end)
    : initializerType(member);
};

const article = (kind: Converted) =>
  kind === 'Array' || kind === 'Object'
    ? `an ${kind.toLowerCase()}`
    : `a ${kind.toLowerCase()}`;

/** A `converter`, or `attribute: false`: no attribute for Lit to convert. */
const convertsItself = (options: Node | undefined): boolean => {
  const attribute = optionOf(options, 'attribute');
  return (
    optionOf(options, 'converter') !== undefined ||
    (attribute?.type === 'Literal' && attribute.value === false)
  );
};

const typeMessage = (
  name: string,
  annotation: string,
  wanted: Converted,
  type: string | undefined
): string => {
  if (type) {
    return `\`type: ${type}\` reads the attribute as ${article(type as Converted)}, but \`${name}\` is \`${annotation}\`.`;
  }
  const noAttribute =
    wanted === 'Array' || wanted === 'Object'
      ? ', or `attribute: false` if it has no attribute'
      : '';
  return `\`${name}\` is ${article(wanted)}, but without \`type: ${wanted}\` Lit reads its attribute as a string: add \`type: ${wanted}\`${noAttribute}.`;
};

const propertyTypeProblem = (
  code: string,
  {member, kind, options, name}: Declared
): Problem | undefined => {
  if (kind !== 'property' || convertsItself(options)) return undefined;
  const annotation = annotationOf(code, member);
  const wanted = annotation && convertedOf(annotation);
  if (!annotation || !wanted) return undefined;
  const type = nameOf(optionOf(options, 'type'));
  if ((type ?? 'String') === wanted) return undefined;
  const key = child(member, 'key')!;
  return {
    rule: 'property-type',
    start: key.start,
    end: key.end,
    message: typeMessage(name, annotation, wanted, type),
  };
};

// --- shadowed-member -------------------------------------------------------

const shadowProblem = ({member, name}: Declared): Problem | undefined => {
  const lit = LIT_ELEMENT_MEMBERS.has(name);
  if (!lit && !HTML_ELEMENT_METHODS.has(name)) return undefined;
  const key = child(member, 'key')!;
  const what = lit
    ? `Lit's own \`${name}\`, which it relies on to update the element`
    : `\`${name}()\`, a method every element has`;
  return {
    rule: 'shadowed-member',
    start: key.start,
    end: key.end,
    message: `This field replaces ${what}: give it another name.`,
  };
};

// --- property-visibility ---------------------------------------------------

const isPrivate = (member: Node) =>
  member.accessibility === 'private' ||
  child(member, 'key')?.type === 'PrivateIdentifier';

const visibilityProblem = (
  file: string,
  {member, decorator, kind, name}: Declared
): Problem | undefined => {
  const at = {
    rule: 'property-visibility' as const,
    start: decorator.start,
    end: decorator.end,
  };
  if (kind === 'property' && isPrivate(member)) {
    return {
      ...at,
      message: `\`@property()\` makes \`${name}\` public API, an attribute and an entry in the docs: use \`@state()\` for internal state.`,
    };
  }
  const typed = /\.[cm]?tsx?$/.test(file);
  const hidden = isPrivate(member) || member.accessibility === 'protected';
  if (kind === 'state' && typed && !hidden) {
    return {
      ...at,
      message: `\`@state()\` is internal, but \`${name}\` is public: make it \`private\` or \`protected\`, or use \`@property()\`.`,
    };
  }
  return undefined;
};

/** The problems in a file's `@property()` and `@state()` declarations. */
export const propertyDefinitionProblems = ({
  file,
  code,
}: {
  file: string;
  code: string;
}): Problem[] => {
  if (!/@(property|state)\s*\(/.test(code)) return [];
  let program: Node;
  try {
    program = parseModule(code, file);
  } catch {
    return [];
  }
  return declaredIn(program).flatMap((declared) =>
    [
      attributeNameProblem(declared),
      shadowProblem(declared),
      propertyTypeProblem(code, declared),
      visibilityProblem(file, declared),
    ].filter((problem) => problem !== undefined)
  );
};
