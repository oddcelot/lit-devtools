/**
 * Which `html` template rendered an element, on a page the plugin never
 * built, so a host with the page's sources can find where it is written.
 * The plugin stamps that place on the element at transform time; without
 * it, the only lead is the template's own text.
 *
 * lit-html keeps a template's strings only as a module-private cache key,
 * so they are recorded as templates are made: lit-html hands its
 * `ChildPart` class to `litHtmlPolyfillSupport` (`…DevMode` in the
 * development build) when it loads, and the hook installed here wraps the
 * method that looks a result's template up (`_$getTemplate`, `_$AC` in the
 * production build) to remember the strings of each template it returns.
 * That only works if it runs before the page's lit-html does, at
 * `document_start` in the extension. A hook something else sets, before or
 * after, still runs.
 *
 * Reading which template made an element walks lit-html's part tree with
 * the same private names `child-state.ts` uses. Every step is guarded; a
 * surprise leaves the element without a template site.
 */

import {defineFramesOf} from './define-sites.js';
import type {TemplateSite} from '../../types/inspector.js';

const HOOKS = ['litHtmlPolyfillSupport', 'litHtmlPolyfillSupportDevMode'];
const GET_TEMPLATE = ['_$getTemplate', '_$AC'];

const COMMITTED = ['_$committedValue', '_$AH'] as const;
const TEMPLATE = ['_$template', '_$AD'] as const;
const PARTS = ['_$parts', '_$AV'] as const;
const START = ['_$startNode', '_$AA'] as const;
const END = ['_$endNode', '_$AB'] as const;
const LIT_PART = '_$litPart$';
const CHILD_PART = 2;

/** Templates walked for one element before giving up. */
const MAX_INSTANCES = 5000;
/** Scripts named as places the template may be written. */
const MAX_SCRIPTS = 8;

/** The raw strings each recorded template was made from. */
const stringsByTemplate = new WeakMap<object, readonly string[]>();
let installed = false;

type Dict = Record<string, unknown>;

const internal = (o: unknown, [dev, prod]: readonly [string, string]) => {
  if (o === null || typeof o !== 'object') return undefined;
  const r = o as Dict;
  return dev in r ? r[dev] : r[prod];
};

/** Wraps the template lookup on lit-html's `ChildPart` to record strings. */
const recordTemplates = (childPart: unknown): void => {
  const proto = (childPart as {prototype?: Dict} | undefined)?.prototype;
  if (proto === undefined) return;
  const name = GET_TEMPLATE.find((n) => typeof proto[n] === 'function');
  if (name === undefined) return;
  const lookUp = proto[name] as (this: unknown, result: unknown) => unknown;
  proto[name] = function (this: unknown, result: unknown) {
    const template = lookUp.call(this, result);
    const strings = (result as {strings?: {raw?: unknown}} | null)?.strings;
    if (
      template !== null &&
      typeof template === 'object' &&
      Array.isArray(strings?.raw) &&
      !stringsByTemplate.has(template)
    ) {
      stringsByTemplate.set(template, [...(strings.raw as string[])]);
    }
    return template;
  };
};

/**
 * Sets the polyfill hooks lit-html calls as it loads. Idempotent. A hook
 * already there, or one set later, is called too.
 */
export const installTemplateSites = (): void => {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as Dict;
  for (const key of HOOKS) {
    let other = g[key] as ((...args: unknown[]) => void) | undefined;
    const hook = (...args: unknown[]) => {
      recordTemplates(args[1]);
      other?.(...args);
    };
    try {
      Object.defineProperty(g, key, {
        configurable: true,
        get: () => hook,
        set: (value: unknown) => {
          if (value !== hook) other = value as typeof other;
        },
      });
    } catch {
      // A hook that cannot be redefined: leave it, and record nothing.
    }
  }
};

/** A rendered template: its strings, and the nodes it put in its part. */
interface Instance {
  strings: readonly string[] | undefined;
  /** Its own nodes: from `start`'s next sibling up to `end`, exclusive. */
  start: Node;
  end: Node | null;
  /** Start node to end node of each child part inside it. */
  holes: Map<Node, Node | null>;
  /** Child parts inside it, to walk next. */
  children: unknown[];
}

const nodeOrNull = (n: unknown): Node | null => (n instanceof Node ? n : null);

/** The child parts among an instance's parts, and the nodes each spans. */
const childPartsOf = (parts: unknown): Pick<Instance, 'holes' | 'children'> => {
  const holes = new Map<Node, Node | null>();
  const children: unknown[] = [];
  for (const p of Array.isArray(parts) ? parts : []) {
    if ((p as {type?: unknown} | undefined)?.type !== CHILD_PART) continue;
    const start = nodeOrNull(internal(p, START));
    if (start !== null) holes.set(start, nodeOrNull(internal(p, END)));
    children.push(p);
  }
  return {holes, children};
};

const instanceOf = (part: unknown): Instance | undefined => {
  const value = internal(part, COMMITTED);
  const template = internal(value, TEMPLATE);
  const start = nodeOrNull(internal(part, START));
  if (template === undefined || start === null) return undefined;
  return {
    strings: stringsByTemplate.get(template as object),
    start,
    end: nodeOrNull(internal(part, END)),
    ...childPartsOf(internal(value, PARTS)),
  };
};

/**
 * The elements a template instance cloned from its template, in tree order:
 * its own nodes and their descendants, skipping whatever its child parts
 * hold (those came from other templates).
 */
const ownElements = (inst: Instance): Element[] => {
  const out: Element[] = [];
  const visit = (first: Node | null, stop: Node | null): void => {
    let n = first;
    while (n !== null && n !== stop) {
      if (inst.holes.has(n)) {
        // A child part's start marker: its content runs up to its end node.
        const end = inst.holes.get(n)!;
        if (end === null) return;
        n = end;
        continue;
      }
      if (n instanceof Element) {
        out.push(n);
        visit(n.firstChild, null);
      }
      n = n.nextSibling;
    }
  };
  visit(inst.start.nextSibling, inst.end);
  return out;
};

/** The child parts a part holds: itself, or an iterable's parts. */
const partsIn = (part: unknown): unknown[] => {
  const value = internal(part, COMMITTED);
  return Array.isArray(value) ? value : [part];
};

/** The instance among those rendered into `container` that cloned `el`. */
const findOwner = (
  container: unknown,
  el: Element
): {inst: Instance; own: Element[]} | undefined => {
  const queue = [...partsIn(container)];
  for (let seen = 0; queue.length > 0 && seen < MAX_INSTANCES; seen++) {
    const part = queue.shift();
    const inst = instanceOf(part);
    if (inst === undefined) {
      // An iterable: its committed value lists more child parts.
      const value = internal(part, COMMITTED);
      if (Array.isArray(value)) queue.push(...value);
      continue;
    }
    const own = ownElements(inst);
    if (own.includes(el)) return {inst, own};
    for (const child of inst.children) queue.push(...partsIn(child));
  }
  return undefined;
};

/** Scripts that define the classes of `el` and of the host rendering it. */
const scriptsFor = (el: Element): string[] => {
  const root = el.getRootNode();
  const ctors = [el.constructor];
  if (root instanceof ShadowRoot) ctors.unshift(root.host.constructor);
  const urls = new Set<string>();
  for (const ctor of ctors) {
    for (const frame of defineFramesOf(ctor) ?? []) urls.add(frame.url);
  }
  if (!(root instanceof ShadowRoot)) {
    for (const script of document.scripts) {
      if (script.src !== '') urls.add(script.src);
    }
  }
  return [...urls].slice(0, MAX_SCRIPTS);
};

/**
 * The template that rendered `el` and which of its `<tag>` elements `el` is,
 * when the hook recorded that template; `undefined` otherwise.
 */
export const templateSiteOf = (el: Element): TemplateSite | undefined => {
  if (!installed) return undefined;
  try {
    for (let node = el.parentNode; node !== null; node = node.parentNode) {
      const container = (node as unknown as Dict)[LIT_PART];
      if (container === undefined) continue;
      const found = findOwner(container, el);
      if (found === undefined) continue;
      const {strings} = found.inst;
      if (strings === undefined) return undefined;
      const tag = el.localName;
      return {
        strings: [...strings],
        tag,
        index: found.own.filter((e) => e.localName === tag).indexOf(el),
        scripts: scriptsFor(el),
      };
    }
  } catch {
    // A part tree that did not read as expected.
  }
  return undefined;
};
