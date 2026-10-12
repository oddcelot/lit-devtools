/**
 * Walks the page to build the component render tree and to snapshot a single
 * element's reactive state for the inspector panel. Runs entirely in the page;
 * the results are sent over the transport as plain JSON.
 */

import {childrenOf, isExpandable, stepInto} from './inspect-value.js';
import {idOf} from '../timeline/identity.js';
import {warningsFor} from '../timeline/lit-warnings.js';
import {
  isForeignElement,
  isInspectable,
  isListed,
  isUndefinedElement,
} from './listed.js';
import {collectAnatomy} from './anatomy.js';
import {collectExtras, extraValue} from './extras.js';
import {serialize, typeTag} from './serialize.js';
import {
  leafOverrideOf,
  listLeafOverrides,
  setLeafOverride,
  takeDropped,
} from './leaf-overrides.js';
import {
  listOverrides,
  overrideOf,
  overridesApplied,
  setOverride,
} from './prop-overrides.js';
import type {
  ElementSource,
  InspectorDetails,
  InspectorOverrideEntry,
  InspectorOverrides,
  InspectorProp,
  InspectorPropOption,
  InspectorTreeNode,
  ValueChild,
  ValuePath,
  ValueSegment,
} from '../../../types/inspector.js';
import {CALL_SITE_ATTR, SOURCE_META_KEY, readCallSite} from '../source-meta.js';
import {defineFramesOf, defineIdOf} from '../define-sites.js';

interface LitSourceMeta {
  filePath: string;
  lineNumber: number;
  componentName: string;
}

/** Subset of ReactiveElement's `PropertyDeclaration` we read. */
interface PropertyDeclaration {
  attribute?: boolean | string;
  reflect?: boolean;
  state?: boolean;
  hasChanged?: unknown;
  converter?: unknown;
  noAccessor?: boolean;
  useDefault?: boolean;
  type?: unknown;
}

/** Subset of a ReactiveElement instance/constructor we duck-type against. */
interface ReactiveElementLike extends Element {
  requestUpdate?: unknown;
  hasUpdated?: boolean;
  isUpdatePending?: boolean;
  constructor: {
    elementProperties?: Map<PropertyKey, PropertyDeclaration>;
    getPropertyOptions?: (name: PropertyKey) => PropertyDeclaration;
    [SOURCE_META_KEY]?: LitSourceMeta;
  };
}

const metaOf = (el: Element): LitSourceMeta | undefined =>
  (el as ReactiveElementLike).constructor[SOURCE_META_KEY];

const sourceOf = (el: Element): ElementSource | undefined => {
  const meta = metaOf(el);
  return meta === undefined
    ? undefined
    : {file: meta.filePath, line: meta.lineNumber};
};

const callSiteOf = (el: Element): ElementSource | undefined => {
  const site = readCallSite(el);
  return site === undefined
    ? undefined
    : {file: site.filePath, line: site.lineNumber, column: site.columnNumber};
};

/**
 * The id of the nearest element the tree lists (see {@link isListed}) at or
 * above `node`: itself, its ancestors, and past each shadow root to its host.
 * `undefined` when none encloses it.
 */
export const listedIdOf = (node: unknown): number | undefined => {
  let el: Element | null =
    node instanceof Element
      ? node
      : node instanceof Node
        ? node.parentElement
        : null;
  while (el !== null) {
    if (isListed(el)) return idOf(el);
    const root = el.getRootNode();
    el = el.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return undefined;
};

const nodeFor = (
  el: Element,
  children: InspectorTreeNode[],
  flag?: 'notDefined' | 'notLit'
): InspectorTreeNode => {
  const meta = metaOf(el);
  // No stamp: a host that can map the define call's stack fills `source`.
  const defineId = meta === undefined ? defineIdOf(el.constructor) : undefined;
  const warned = warningsFor(
    el.localName,
    (el.constructor as {name?: string}).name
  ).length;
  return {
    id: idOf(el),
    ...(flag !== undefined ? {[flag]: true} : {}),
    ...(warned > 0 ? {warnings: warned} : {}),
    tagName: el.tagName.toLowerCase(),
    componentName: meta?.componentName,
    source:
      meta === undefined
        ? undefined
        : {file: meta.filePath, line: meta.lineNumber},
    ...(defineId !== undefined ? {defineId} : {}),
    callSite: callSiteOf(el),
    children,
  };
};

/**
 * Visits `el`: if it's inspectable it becomes a node whose children are the
 * inspectables nested in its shadow + light DOM; otherwise we descend, pushing
 * any inspectables we find into the current `sink` (so non-component wrappers
 * are flattened away).
 */
const visit = (
  el: Element,
  sink: InspectorTreeNode[],
  onUndefined?: (tag: string) => void
): void => {
  if (isInspectable(el)) {
    const children: InspectorTreeNode[] = [];
    descend(el, children, onUndefined);
    sink.push(nodeFor(el, children));
  } else if (isUndefinedElement(el)) {
    // Kept in its real position so the tree shows where the missing component
    // sits; light children are still walked, they may be components.
    onUndefined?.(el.localName);
    const children: InspectorTreeNode[] = [];
    descend(el, children, onUndefined);
    sink.push(nodeFor(el, children, 'notDefined'));
  } else if (isForeignElement(el)) {
    const children: InspectorTreeNode[] = [];
    descend(el, children, onUndefined);
    sink.push(nodeFor(el, children, 'notLit'));
  } else {
    descend(el, sink, onUndefined);
  }
};

const descend = (
  el: Element,
  sink: InspectorTreeNode[],
  onUndefined?: (tag: string) => void
): void => {
  const shadow = el.shadowRoot;
  if (shadow !== null) {
    for (const child of shadow.children) visit(child, sink, onUndefined);
  }
  for (const child of el.children) visit(child, sink, onUndefined);
};

/**
 * Build the full component render tree rooted at the document body.
 * `onUndefined` hears the tag of each element that has no definition yet, so
 * the caller can rebuild once one is defined.
 */
export const buildTree = (
  onUndefined?: (tag: string) => void
): InspectorTreeNode[] => {
  const roots: InspectorTreeNode[] = [];
  for (const child of document.body.children) visit(child, roots, onUndefined);
  return roots;
};

const attributeName = (
  key: PropertyKey,
  decl: PropertyDeclaration
): string | false => {
  if (decl.attribute === false) return false;
  if (typeof decl.attribute === 'string') return decl.attribute;
  return String(key).toLowerCase();
};

/**
 * The declaration options that differ from Lit's defaults, by name. Only the
 * presence of a function is detected, never what it does: `hasChanged` and
 * `converter` count when they are not the ones Lit fills in for a bare
 * `@property()`, which `getPropertyOptions` returns for an undeclared name.
 */
const optionsOf = (
  ctor: ReactiveElementLike['constructor'],
  decl: PropertyDeclaration
): InspectorPropOption[] => {
  const base = ctor.getPropertyOptions?.(Symbol('lit-devtools-default'));
  const out: InspectorPropOption[] = [];
  if (decl.hasChanged != null && decl.hasChanged !== base?.hasChanged) {
    out.push('hasChanged');
  }
  if (decl.converter != null && decl.converter !== base?.converter) {
    out.push('converter');
  }
  if (decl.noAccessor === true) out.push('noAccessor');
  if (decl.useDefault === true) out.push('useDefault');
  return out;
};

type EditableKind = NonNullable<InspectorProp['editable']>;

const EDITABLE_TYPES = new Map<unknown, EditableKind>([
  [String, 'string'],
  [Number, 'number'],
  [Boolean, 'boolean'],
]);

/**
 * Which primitive a value can be edited as: its own type, or for an unset
 * one the declared `type` (`null` has no type of its own to go by).
 */
const editableOf = (
  value: unknown,
  decl: PropertyDeclaration
): EditableKind | undefined => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value as EditableKind;
  }
  return value == null ? EDITABLE_TYPES.get(decl.type) : undefined;
};

/** One declared reactive property, read without trusting its getter. */
const propOf = (
  el: Element,
  key: PropertyKey,
  decl: PropertyDeclaration
): InspectorProp => {
  // Reading a reactive property runs its accessor, which may throw; one bad
  // getter must not take out the whole details snapshot.
  let value: unknown;
  let threw = false;
  try {
    value = (el as unknown as Record<PropertyKey, unknown>)[key];
  } catch {
    threw = true;
  }
  const options = optionsOf((el as ReactiveElementLike).constructor, decl);
  const editable = threw ? undefined : editableOf(value, decl);
  const override = typeof key === 'string' ? overrideOf(el, key) : undefined;
  return {
    name: typeof key === 'symbol' ? key.toString() : String(key),
    value: threw ? '[getter threw]' : serialize(value),
    type: threw ? 'error' : typeTag(value),
    attribute: attributeName(key, decl),
    reflects: decl.reflect === true,
    state: decl.state === true,
    ...(options.length > 0 ? {options} : {}),
    ...(!threw && isExpandable(value) ? {expandable: true} : {}),
    ...(editable !== undefined ? {editable} : {}),
    ...(override !== undefined
      ? {
          override: {
            value: serialize(override.value),
            enabled: override.enabled,
            intrinsic: serialize(override.intrinsic),
          },
        }
      : {}),
  };
};

const propertiesOf = (el: Element): InspectorProp[] => {
  const declarations = (el as ReactiveElementLike).constructor
    .elementProperties;
  const properties: InspectorProp[] = [];
  if (declarations === undefined) return properties;
  for (const [key, decl] of declarations) {
    properties.push(propOf(el, key, decl));
  }
  return properties;
};

/** The call-site stamp is ours, not the author's: it has its own field. */
const attributesOf = (el: Element): InspectorDetails['attributes'] =>
  Array.from(el.attributes, (a) => ({name: a.name, value: a.value})).filter(
    (a) => a.name !== CALL_SITE_ATTR
  );

/** What marks the element as not a plain Lit component, when it is one. */
const statusOf = (
  el: Element,
  source: InspectorDetails['source']
): Partial<InspectorDetails> => {
  // No stamp: the define call's stack, for a host that can map it.
  const defineFrames =
    source === undefined ? defineFramesOf(el.constructor) : undefined;
  return {
    ...(defineFrames !== undefined ? {defineFrames} : {}),
    ...(isUndefinedElement(el) ? {notDefined: true} : {}),
    ...(isForeignElement(el) ? {notLit: true} : {}),
  };
};

/** The sections that are present only when they have something to say. */
const insightsOf = (el: Element): Partial<InspectorDetails> => {
  const extras = collectExtras(el);
  const anatomy = collectAnatomy(el);
  const warnings = warningsFor(
    el.localName,
    (el.constructor as {name?: string}).name
  ).map(({code, message}) => ({code, message}));
  return {
    ...(anatomy !== undefined ? {anatomy} : {}),
    ...(extras.length > 0 ? {extras} : {}),
    ...(warnings.length > 0 ? {warnings} : {}),
  };
};

/** Snapshot one element's reactive properties, attributes, and flags. */
export const collectDetails = (el: Element): InspectorDetails => {
  const re = el as ReactiveElementLike;
  const meta = metaOf(el);
  const source = sourceOf(el);
  return {
    id: idOf(el),
    tagName: el.tagName.toLowerCase(),
    componentName: meta?.componentName,
    source,
    callSite: callSiteOf(el),
    ...statusOf(el, source),
    attributes: attributesOf(el),
    properties: propertiesOf(el),
    flags: {
      hasUpdated: re.hasUpdated === true,
      isUpdatePending: re.isUpdatePending === true,
      hasShadowRoot: el.shadowRoot !== null,
    },
    ...insightsOf(el),
  };
};

/**
 * Answer an `expand` command: the children of the value at `path` on `el`,
 * or null when a step no longer resolves (the value changed shape since the
 * panel saw it). Only declared reactive properties and listed extras are
 * reachable, so a path cannot read arbitrary fields.
 */
export const expandPath = (
  el: Element,
  path: ValuePath
): {children: ValueChild[]; more: number} | null => {
  let at: {value: unknown} | undefined;
  if (path.section === 'prop') {
    const declared = (el as ReactiveElementLike).constructor.elementProperties;
    if (declared?.has(path.name) !== true) return null;
    try {
      at = {value: (el as unknown as Record<string, unknown>)[path.name]};
    } catch {
      return null;
    }
  } else {
    at = extraValue(el, path.name);
  }
  for (const key of path.keys) {
    if (at === undefined) return null;
    at = stepInto(at.value, key);
  }
  if (at === undefined) return null;
  const listed = childrenOf(at.value);
  if (path.section !== 'prop') return listed;
  return {
    ...listed,
    children: listed.children.map((c) => {
      const o = leafOverrideOf(el, path.name, [...path.keys, c.key]);
      return o === undefined
        ? c
        : {
            ...c,
            override: {
              value: serialize(o.value),
              enabled: o.enabled,
              intrinsic: serialize(o.intrinsic),
            },
          };
    }),
  };
};

/**
 * The nested half of {@link setProp}: override the leaf at `keys` below the
 * declared property `name`, in the live value, so its identity is kept.
 */
const setNestedProp = (
  el: Element,
  name: string,
  value: string | number | boolean,
  keys: ValueSegment[]
): boolean => {
  const re = el as ReactiveElementLike;
  if (re.constructor.elementProperties?.has(name) !== true) return false;
  return setLeafOverride(el, name, keys, value);
};

/**
 * The top-level half of {@link setProp}: override the property itself, so
 * the app's own writes keep landing underneath (see `prop-overrides.ts`).
 */
const setOwnProp = (
  el: Element,
  name: string,
  value: string | number | boolean
): boolean => {
  const re = el as ReactiveElementLike;
  const decl = re.constructor.elementProperties?.get(name);
  if (decl === undefined) return false;
  try {
    const kind = editableOf(
      (el as unknown as Record<string, unknown>)[name],
      decl
    );
    if (kind === undefined || typeof value !== kind) return false;
  } catch {
    return false;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  return setOverride(el, name, value);
};

/**
 * Answer a `set-prop` command: set `value` on the declared reactive
 * property `name` on `el`, as an override. Only a declared property whose current value is a
 * primitive of the same type is written, so a command cannot set arbitrary
 * fields or change a property's type. With `keys`, the leaf at that path
 * inside the property's live value is written instead. Returns whether it
 * was applied.
 */
export const setProp = (
  el: Element,
  name: string,
  value: string | number | boolean,
  keys: ValueSegment[] = []
): boolean => {
  return keys.length === 0
    ? setOwnProp(el, name, value)
    : setNestedProp(el, name, value, keys);
};

const entryOf = (o: {
  el: Element;
  name: string;
  keys?: ValueSegment[];
  value: unknown;
  enabled: boolean;
}): InspectorOverrideEntry => ({
  id: idOf(o.el),
  tagName: o.el.localName,
  name: o.name,
  ...(o.keys !== undefined ? {keys: o.keys} : {}),
  value: serialize(o.value),
  enabled: o.enabled,
});

/**
 * Every override in the page, for an `overrides` message, with the leaf
 * overrides dropped since the last one.
 */
export const collectOverrides = (): InspectorOverrides => {
  const entries = [...listOverrides(), ...listLeafOverrides()].map(entryOf);
  const dropped = takeDropped().map(entryOf);
  return {
    applied: overridesApplied(),
    entries,
    ...(dropped.length > 0 ? {dropped} : {}),
  };
};
