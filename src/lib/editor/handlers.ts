/**
 * Event handlers written inline in `@event` bindings, `@go=${(ev) => …}`:
 * the parameter that receives the event, and the members of the event's
 * type that `ev.` and `ev.detail.` reach.
 *
 * Read with patterns rather than the parser, since the expression rarely
 * parses while it's typed (`ev.detail.` ends in a dot). Types are the text
 * the docs carry, so only an object shape like `{id: string}` has members;
 * a named type such as `Item` is TypeScript's to know.
 */

import {type Member, detailOf, objectMembers} from './type-text.js';
import {
  type DocumentKind,
  type MarkupAttribute,
  type MarkupElement,
  type MarkupOptions,
  markupRegions,
  scanMarkup,
} from './markup.js';

export interface HandlerParam {
  name: string;
  start: number;
  end: number;
  /** Already annotated, so TypeScript knows its type. */
  typed: boolean;
  /** In parentheses, so an annotation can go right after it. */
  parenthesized: boolean;
}

export interface EventHandler {
  element: MarkupElement;
  attribute: MarkupAttribute;
  param: HandlerParam;
  /** The expression inside `${…}`. */
  start: number;
  end: number;
}

const IDENT = '[A-Za-z_$][\\w$]*';
const FUNCTION_RE = new RegExp(
  `^(\\s*(?:async\\s+)?function\\b\\s*(?:${IDENT})?\\s*\\(\\s*)(${IDENT})(\\s*:)?`
);
const PAREN_ARROW_RE = new RegExp(
  `^(\\s*(?:async\\s*)?\\(\\s*)(${IDENT})(\\s*:)?[^)]*\\)\\s*=>`
);
const BARE_ARROW_RE = new RegExp(`^(\\s*(?:async\\s+)?)(${IDENT})\\s*=>`);

/** The parameter a handler expression receives the event in, if it's inline. */
const paramOf = (text: string, base: number): HandlerParam | undefined => {
  for (const [re, parenthesized] of [
    [FUNCTION_RE, true],
    [PAREN_ARROW_RE, true],
    [BARE_ARROW_RE, false],
  ] as const) {
    const match = re.exec(text);
    if (!match) continue;
    const start = base + match[1].length;
    return {
      name: match[2],
      start,
      end: start + match[2].length,
      typed: match[3] !== undefined,
      parenthesized,
    };
  }
  return undefined;
};

/** The inline handler of an `@` attribute whose value is one `${…}`. */
const handlerOf = (
  code: string,
  element: MarkupElement,
  attribute: MarkupAttribute
): EventHandler | undefined => {
  const value = attribute.value;
  if (attribute.binding !== '@' || !value?.expression) return undefined;
  if (!code.startsWith('${', value.start)) return undefined;
  const start = value.start + 2;
  const end = code[value.end - 1] === '}' ? value.end - 1 : value.end;
  const param = paramOf(code.slice(start, end), start);
  return param && {element, attribute, param, start, end};
};

/** Every inline event handler in the document's markup. */
export const eventHandlers = (
  code: string,
  kind: DocumentKind,
  options: MarkupOptions = {}
): EventHandler[] =>
  markupRegions(code, kind, options).flatMap((region) =>
    scanMarkup(code, region).flatMap((element) =>
      element.attributes.flatMap((attribute) => {
        const handler = handlerOf(code, element, attribute);
        return handler ? [handler] : [];
      })
    )
  );

export interface MemberAccess {
  handler: EventHandler;
  /** The members between the parameter and the cursor: `['detail']`. */
  path: string[];
  /** The member name typed before the cursor. */
  prefix: string;
  start: number;
  end: number;
}

const ACCESS_RE = new RegExp(
  `(${IDENT})((?:\\s*\\.\\s*${IDENT})*)\\s*\\.\\s*([\\w$]*)$`
);

/**
 * The member access the cursor is in, `ev.detail.na‸`, when `ev` is an
 * untyped handler parameter; TypeScript completes a typed one.
 */
export const memberAccessAt = (
  code: string,
  kind: DocumentKind,
  offset: number,
  options: MarkupOptions = {}
): MemberAccess | undefined => {
  const handler = eventHandlers(code, kind, options).find(
    (h) => h.start <= offset && offset <= h.end
  );
  if (!handler || handler.param.typed) return undefined;
  const match = ACCESS_RE.exec(code.slice(handler.param.end, offset));
  if (!match || match[1] !== handler.param.name) return undefined;
  const path = match[2]
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  const rest = /^[\w$]*/.exec(code.slice(offset))?.[0] ?? '';
  return {
    handler,
    path,
    prefix: match[3],
    start: offset - match[3].length,
    end: offset + rest.length,
  };
};

// --- type text ---------------------------------------------------------------

/** What every event has, whatever its class. */
const EVENT_MEMBERS: Member[] = [
  {name: 'type', type: 'string'},
  {name: 'target', type: 'EventTarget | null'},
  {name: 'currentTarget', type: 'EventTarget | null'},
  {name: 'bubbles', type: 'boolean'},
  {name: 'composed', type: 'boolean'},
  {name: 'defaultPrevented', type: 'boolean'},
  {name: 'timeStamp', type: 'number'},
  {name: 'preventDefault', type: '() => void'},
  {name: 'stopPropagation', type: '() => void'},
  {name: 'stopImmediatePropagation', type: '() => void'},
  {name: 'composedPath', type: '() => EventTarget[]'},
];

/**
 * The members of `eventType` reached through `path`: the event's own for
 * none, then into `detail` and its object shapes.
 */
export const membersOf = (
  eventType: string,
  path: readonly string[]
): Member[] => {
  const detail = detailOf(eventType);
  if (path.length === 0) {
    return detail
      ? [{name: 'detail', type: detail}, ...EVENT_MEMBERS]
      : EVENT_MEMBERS;
  }
  let type: string | undefined = path[0] === 'detail' ? detail : undefined;
  for (const name of path.slice(1)) {
    type = objectMembers(type ?? '')?.find((m) => m.name === name)?.type;
  }
  return (type === undefined ? undefined : objectMembers(type)) ?? [];
};
