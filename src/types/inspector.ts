/**
 * Shared types and channel/path constants for the Components inspector.
 *
 * The inspector lets the DevTools panel show a hierarchical tree of the Lit
 * components on the page plus a detail view (reactive properties, internal
 * state, attributes, source) of a selected element. The panel can't touch the
 * page DOM directly (separate iframe document), so everything flows over the
 * existing transport: panel → host (devframe RPC `inspect`) → app runtime
 * (page channel {@link INSPECT_CMD_CHANNEL}); app → host (page channel
 * {@link INSPECT_DATA_CHANNEL}) → panel (devframe).
 *
 * Elements are referenced across the boundary by the stable numeric id from the
 * timeline's `idOf()` WeakMap, so a tree node, a details payload, and an
 * inspector pick all agree on identity.
 */

export interface ElementSource {
  file: string;
  line: number;
  /** 1-based column, when known (call sites carry one; declarations don't). */
  column?: number;
  /**
   * The original source's absolute URL as DevTools names it, when the
   * location was resolved through a page's sourcemap (the extension, on a
   * page without the plugin). Opens in the Sources panel, not an editor.
   */
  url?: string;
  /** The generated script position the location was mapped from. */
  generated?: GeneratedFrame;
}

/**
 * One frame of a `customElements.define` call's stack, as the browser printed
 * it: a script URL with a 1-based line and column in the generated code.
 */
export interface GeneratedFrame {
  url: string;
  line: number;
  column: number;
}

/**
 * An element's place in the `html` template that rendered it, by the
 * template's text: what a host searches the page's sources for.
 */
export interface TemplateSite {
  /** The template literal's raw strings, as written in the source. */
  strings: string[];
  /** The element's tag name. */
  tag: string;
  /** Which `<tag>` of the template it is, 0 for the first. */
  index: number;
  /** Scripts the template is likely written in, most likely first. */
  scripts: string[];
}

/** A node in the component render tree (one inspectable Lit element). */
export interface InspectorTreeNode {
  id: number;
  tagName: string;
  componentName?: string;
  /** Where the component class is declared. */
  source?: ElementSource;
  /**
   * Names the class's `customElements.define` call when `source` is absent and
   * the runtime saw it (the extension's); see {@link TimelineEvent.meta}. The
   * host fills `source` from it.
   */
  defineId?: number;
  /**
   * Where this instance was written, in an `html` template or an HTML entry
   * file, from the `data-lit-source` attribute the dev transform stamps.
   * Absent for elements created any other way (`createElement`, a dynamic
   * tag).
   */
  callSite?: ElementSource;
  /**
   * Set when the tag is a custom element name nothing has defined: a missing
   * import, a typo, or a chunk that has not loaded. It has no Lit state.
   */
  notDefined?: true;
  /**
   * Set when the tag is a custom element another library defined (it has no
   * `requestUpdate`). It is listed where it sits, but has no Lit state.
   */
  notLit?: true;
  /**
   * Set when the tag is defined but this element was never upgraded to its
   * class: the constructor threw, or it was created before the define and
   * not connected since. It has no Lit state.
   */
  notUpgraded?: true;
  /**
   * Set for an element Lit rendered on the server: `deferred` while
   * `defer-hydration` holds it back, `pending` until its first update
   * hydrates it, `hydrated` after. Absent for one the browser rendered.
   */
  ssr?: 'deferred' | 'pending' | 'hydrated';
  /**
   * How many distinct Lit dev-mode warnings name this component. Lit issues
   * each once per page, so this is per tag/class, not per instance. Absent
   * when there are none.
   */
  warnings?: number;
  children: InspectorTreeNode[];
  /**
   * Set only when a depth limit pruned this node's children: how many
   * direct children were dropped. Absent on the unpruned tree.
   */
  hiddenChildren?: number;
}

/** A reactive-property option that departs from Lit's default. */
export type InspectorPropOption =
  | 'hasChanged'
  | 'converter'
  | 'noAccessor'
  | 'useDefault';

/** One reactive property (or internal `@state`) of an inspected element. */
export interface InspectorProp {
  name: string;
  /** Serialized, depth-limited preview of the current value. */
  value: string;
  /** A short type tag (`string`, `number`, `Array(3)`, `MyClass`, …). */
  type: string;
  /** The reflected attribute name, or `false` when `attribute: false`. */
  attribute: string | false;
  /** Whether the property reflects to its attribute. */
  reflects: boolean;
  /** Whether it's an internal `@state()` (no public attribute). */
  state: boolean;
  /**
   * Declaration options set beyond Lit's defaults: a custom `hasChanged` or
   * `converter`, `noAccessor`, `useDefault`. Absent when none is set, and
   * from an older runtime. Presence only; the functions are never called.
   */
  options?: InspectorPropOption[];
  /**
   * Whether the value has children to list with an `expand` command. Absent
   * from an older runtime, which cannot answer one.
   */
  expandable?: boolean;
  /**
   * The primitive type a `set-prop` command may assign to it. Absent when the
   * value cannot be edited from its preview, and from an older runtime.
   */
  editable?: 'string' | 'number' | 'boolean';
  /**
   * The panel's override on this property, when it has one. `value` above is
   * whichever of the two is in effect: the override while it is on and
   * overrides apply, else the element's intrinsic value.
   */
  override?: InspectorPropOverride;
  /**
   * The class that declared the property: its `name` and how many classes
   * up from the element's own it sits (0 for the element's own class).
   * Present on every property, or on none when one class declared them all,
   * and absent from an older runtime.
   */
  declaredBy?: {name: string; depth: number};
}

/**
 * A value the panel set on a property, layered over the element's intrinsic
 * one (what the element and the app last set). Both are serialized previews.
 */
export interface InspectorPropOverride {
  value: string;
  /** This override's own switch; the global one is {@link InspectorOverrides}. */
  enabled: boolean;
  /** Kept across reloads of the page. Absent from an older runtime. */
  persist?: boolean;
  intrinsic: string;
}

/** One override in the page, for the panel's list of them. */
export interface InspectorOverrideEntry {
  id: number;
  tagName: string;
  name: string;
  /** The path to a leaf inside the property's value; absent for the property. */
  keys?: ValueSegment[];
  /** Serialized preview of the override value. */
  value: string;
  enabled: boolean;
  /** Kept across reloads of the page. */
  persist?: boolean;
  /**
   * Only on a dropped entry: `replaced` when the app replaced the object the
   * leaf was in, `refused` when a saved override no longer fit the element
   * it was restored to (a renamed property, a changed type).
   */
  reason?: 'replaced' | 'refused';
}

/** Every override in the page, and whether they apply at all. */
export interface InspectorOverrides {
  applied: boolean;
  entries: InspectorOverrideEntry[];
  /**
   * Overrides the page dropped since the last message, each reported once;
   * `reason` says why.
   */
  dropped?: InspectorOverrideEntry[];
  /**
   * Whether this page can keep overrides across reloads: true on the
   * dev-server hosts, absent from the extension, which has no storage of
   * the page's to write to, and from an older runtime.
   */
  canPersist?: boolean;
  /**
   * How many saved overrides this page has not found an element for yet.
   * They apply when one appears; clearing the overrides forgets them.
   */
  waiting?: number;
}

/**
 * One piece of non-reactive instance state: a reactive controller, a
 * `@lit/task`, a signal, or a plain class field.
 */
export interface InspectorExtra {
  kind: 'controller' | 'task' | 'signal' | 'field' | 'context';
  /**
   * The own-field name when the controller or signal is stored in one, else
   * its constructor name.
   */
  name: string;
  /**
   * Serialized preview of the value: a task's value or error, a signal's
   * value, a field's value.
   */
  value: string;
  /** A short type tag, or the constructor name for a controller. */
  type: string;
  /** A task's status (`initial`, `pending`, `complete`, `error`). */
  status?: string;
  /** As {@link InspectorProp.expandable}. */
  expandable?: boolean;
  /** `@lit/context` role of a `context` extra, and how it links to others. */
  context?: InspectorContext;
}

/**
 * A `@lit/context` provider or consumer on the element: the context key as
 * written, and the elements on the other side of it.
 */
export interface InspectorContext {
  role: 'provider' | 'consumer';
  /** The context key: a Symbol's description, a string, else a preview. */
  key: string;
  /** Consumer only: the provider that answered it, when one is found. */
  provider?: AnatomyElementRef;
  /**
   * Consumer only: it subscribed and no provider has answered yet. A
   * `ContextRoot` above it keeps the request and replays it when a provider
   * of the key connects.
   */
  waiting?: true;
  /**
   * Provider only: the consumers that subscribed to it, at most 12. A
   * consumer that did not ask for updates is not recorded by the provider.
   */
  consumers?: AnatomyElementRef[];
  /** Subscribed consumers past the first 12. */
  moreConsumers?: number;
}

/**
 * One step into a value: an object key, or the position of an item in an
 * array, `Map` or `Set` (iteration order for the latter two).
 */
export type ValueSegment = string | number;

/**
 * Where a value sits on an element: a details row, by section and name, then
 * the steps from that row's value down to the one meant.
 */
export interface ValuePath {
  section: 'prop' | 'extra';
  name: string;
  keys: ValueSegment[];
}

/** One child of an expanded value. */
export interface ValueChild {
  /** The key, index or (for a `Map`) serialized key, as shown. */
  label: string;
  /** The segment that reaches this child from its parent. */
  key: ValueSegment;
  /** Whether `label` is a `Map` key, shown as `label => value`. */
  entry?: boolean;
  value: string;
  type: string;
  expandable: boolean;
  /**
   * The primitive type a `set-prop` command may assign to it, by `keys`.
   * Absent for a value that is not a string, number or boolean, for a slot
   * that cannot be written (a `Set` member), and from an older runtime.
   */
  editable?: 'string' | 'number' | 'boolean';
  /** The panel's override on this leaf, when it has one. */
  override?: InspectorPropOverride;
}

/** An element named in an anatomy entry; `id` is set when the tree lists it. */
export interface AnatomyElementRef {
  tagName: string;
  id?: number;
}

/** One `<slot>` in an element's shadow root. */
export interface AnatomySlot {
  /** The slot's `name`, `''` for the default slot. */
  name: string;
  /**
   * `assigned` when light children land in it, `fallback` when it renders
   * its own content instead, `empty` when it renders nothing at all.
   */
  status: 'assigned' | 'fallback' | 'empty';
  /** Assigned elements, flattened through forwarded slots, at most 12. */
  elements: AnatomyElementRef[];
  /** Assigned elements past the first 12. */
  moreElements: number;
  /** Assigned text nodes that are not just whitespace. */
  textNodes: number;
  /** The content arrives through a slot of an enclosing shadow root. */
  forwarded: boolean;
  /**
   * An earlier slot has the same name, so this one never receives content.
   */
  duplicate: boolean;
}

/** A light child that matches no slot, so the browser never renders it. */
export interface AnatomyOrphan extends AnatomyElementRef {
  /** The `slot` attribute it asks for, `''` for the default slot. */
  slot: string;
}

/**
 * An element in the shadow root that exposes itself to `::part()`, or one
 * deeper in a nested component's shadow root that is forwarded up.
 */
export interface AnatomyPart {
  names: string[];
  tagName: string;
  /**
   * A nested component forwards this part with `exportparts`: `from` is its
   * tag, `inner` the part's name inside it when `exportparts` renames it.
   */
  forwarded?: {from: string; inner?: string};
}

/**
 * How an element composes its content: where it renders, its slots, the
 * light children no slot takes, and its `::part` exports.
 */
export interface InspectorAnatomy {
  /** `light` when `createRenderRoot` returns the element itself. */
  renderRoot: 'shadow' | 'light';
  /** The shadow root's mode; absent for light DOM. */
  mode?: 'open' | 'closed';
  delegatesFocus?: boolean;
  slots: AnatomySlot[];
  orphans: AnatomyOrphan[];
  /** Light text that matches no slot (no default slot to take it). */
  orphanText: number;
  parts: AnatomyPart[];
}

/**
 * One region of the anatomy overlay: slot `index` or part `index`, in the
 * order {@link InspectorAnatomy} lists them.
 */
export interface AnatomyFocus {
  kind: 'slot' | 'part';
  index: number;
}

/**
 * Colours the anatomy overlay gives slots and parts, in order. The details
 * pane uses the same list, so a slot row and its region on the page match.
 */
export const ANATOMY_COLORS = [
  '#4d63ff',
  '#e8590c',
  '#2f9e44',
  '#c2255c',
  '#1098ad',
  '#9c36b5',
  '#f08c00',
  '#5c940d',
] as const;

/**
 * A Lit dev-mode warning that names this element's tag or component class
 * (`change-in-update`, class-field shadowing, …). Lit issues each message once
 * per page, so it describes the component, not only this instance.
 */
export interface InspectorWarning {
  /** Lit's message code, `''` when Lit gave none; see lit.dev/msg/<code>. */
  code: string;
  message: string;
}

/** Full detail snapshot for a single inspected element. */
/**
 * Names an element so a later load of the page can find it again, when ids
 * have been minted afresh: by its template call site and its place among the
 * elements stamped with it, or, unstamped, by its path from the document.
 */
export interface ElementKey {
  tag: string;
  /** The call-site stamp, when there is one. */
  site?: string;
  /** With `site`: how many elements with that stamp come before this one. */
  nth?: number;
  /** Without `site`: indexes from the document down, `s` entering a shadow root. */
  path?: string;
}

export interface InspectorDetails {
  id: number;
  /**
   * How to find this element again after a reload. Only on the answer to a
   * `details` command, not on the pushes a watch sends, and absent from an
   * older runtime.
   */
  key?: ElementKey;
  tagName: string;
  componentName?: string;
  /** Where the component class is declared. */
  source?: ElementSource;
  /** Where this instance was written in a template; see {@link InspectorTreeNode.callSite}. */
  callSite?: ElementSource;
  /**
   * The stack of the `customElements.define` call that registered this
   * element's class, innermost first, when the plugin stamped no `source`
   * and the runtime saw the call (the extension's, which installs before the
   * page defines anything). A host with the page's sourcemaps resolves it
   * into `source`.
   */
  defineFrames?: GeneratedFrame[];
  /**
   * The template that rendered this element, when the plugin stamped no
   * `callSite` and the runtime recorded the template (the extension's). A
   * host with the page's sources finds it there and sets `callSite`.
   */
  templateSite?: TemplateSite;
  /** As {@link InspectorTreeNode.notDefined}. */
  notDefined?: true;
  /** As {@link InspectorTreeNode.notLit}. */
  notLit?: true;
  /** As {@link InspectorTreeNode.notUpgraded}. */
  notUpgraded?: true;
  /** As {@link InspectorTreeNode.ssr}. */
  ssr?: 'deferred' | 'pending' | 'hydrated';
  attributes: Array<{name: string; value: string}>;
  properties: InspectorProp[];
  flags: {
    hasUpdated: boolean;
    isUpdatePending: boolean;
    hasShadowRoot: boolean;
  };
  /** Render root, slots and parts. Absent for an element with no render root. */
  anatomy?: InspectorAnatomy;
  /**
   * Non-reactive instance state: controllers, tasks, signals, plain fields.
   * Absent when there is none.
   */
  extras?: InspectorExtra[];
  /**
   * Lit dev-mode warnings about this component. Absent when there are none,
   * and always absent under a production build of Lit, which issues none.
   */
  warnings?: InspectorWarning[];
}

/**
 * Loaded versions per Lit package (`lit-html`, `lit-element`,
 * `@lit/reactive-element`), one entry per loaded copy; more than one entry
 * means duplicates. The `lit` package itself pushes no version, and its
 * version differs from `lit-element`'s, so each package is named.
 */
export type LitPackageVersions = Record<string, string[]>;

/** App runtime → panel messages, carried on SSE `event: inspect`. */
/**
 * A Lit DevTools runtime a page can carry: the plugin's, served through Vite;
 * the Lit Inspector extension's; or the `lit-devtools dev` script's.
 */
export type PageRuntimeKind = 'vite' | 'extension' | 'standalone';

/**
 * How the console and the panel name each {@link PageRuntimeKind}, written
 * to sit mid-sentence; {@link sentenceStart} for the first word.
 */
export const PAGE_RUNTIME_NAMES: Record<PageRuntimeKind, string> = {
  vite: "the dev server's plugin",
  extension: 'the Lit Inspector extension',
  standalone: 'the lit-devtools dev script',
};

/** `text` with its first letter capitalized, to open a sentence. */
export const sentenceStart = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

export type InspectorMessage =
  /**
   * The runtime came online; the panel should (re)request the tree. Carries
   * what the page can say about itself, so an empty tree can be explained.
   * Every field is optional: an older runtime sends a bare `ready`.
   */
  | {
      type: 'ready';
      litPackages?: LitPackageVersions;
      topFrame?: boolean;
      /** Whether the browser draws the Chrome Performance tracks. */
      chromeTracks?: boolean;
      /** The DevTools runtimes on the page; more than one get in each other's way. */
      runtimes?: PageRuntimeKind[];
    }
  | {type: 'tree'; roots: InspectorTreeNode[]}
  | {type: 'details'; details: InspectorDetails}
  /**
   * The define-call frames for the ids a `define-frames` command asked about;
   * an id the runtime does not know is left out.
   */
  | {type: 'define-frames'; frames: Record<number, GeneratedFrame[]>}
  /**
   * The page's answer to a `fetch-text` command. `ok` is false when the URL
   * was refused or the fetch failed; `sourceMap` is the response's `SourceMap`
   * or `X-SourceMap` header, if it had one.
   */
  | {
      type: 'fetched-text';
      url: string;
      ok: boolean;
      sourceMap?: string;
      text?: string;
    }
  /** The requested element id couldn't be resolved (removed / GC'd). */
  | {type: 'gone'; id: number}
  /** An inspect-mode overlay pick — select this element in the panel. */
  | {type: 'pick'; id: number}
  /**
   * The children of the value at `path` on element `id`, answering an
   * `expand` command. `children` is null when the path no longer resolves;
   * `more` counts children past the ones listed.
   */
  | {
      type: 'expanded';
      id: number;
      path: ValuePath;
      children: ValueChild[] | null;
      more?: number;
    }
  /** The element `key` names on this page, answering `locate`; null if none. */
  | {type: 'located'; key: ElementKey; id: number | null}
  /**
   * The page's overrides, answering an `overrides` command and sent again
   * whenever one is set, toggled or removed.
   */
  | ({type: 'overrides'} & InspectorOverrides);

/** Panel → app runtime commands, sent over the devframe `inspect` RPC. */
export type InspectorCommand =
  | {type: 'tree'}
  | {type: 'details'; id: number}
  /** The define-call frames behind these `defineId`s, answered in one message. */
  | {type: 'define-frames'; ids: number[]}
  /**
   * Have the page fetch `url` and send back its text, for hosts with no
   * access to the page's scripts of their own. Only the page's own origin is
   * fetched.
   */
  | {type: 'fetch-text'; url: string}
  /** Keep pushing fresh details for `id` as it updates; `null` stops. */
  | {type: 'watch'; id: number | null}
  /** Outline element `id` in the page on tree hover; `null` clears it. */
  | {type: 'highlight'; id: number | null}
  /**
   * Outline every element in `ids` at once, replacing the single hover
   * outline; an empty list clears them.
   */
  | {type: 'highlight-all'; ids: number[]}
  /** Scroll element `id` into view in the page and outline it briefly. */
  | {type: 'reveal'; id: number}
  /**
   * Call `requestUpdate()` on element `id`, so its next tick runs with a
   * `devtools` cause. Answered with `gone` when the element no longer exists.
   */
  | {type: 'request-update'; id: number}
  /**
   * Store the value at `path` on element `id` in the next free `temp1`,
   * `temp2`… global, and log it to the console under that name, as the
   * browser's own "Store as global variable" does.
   */
  | {type: 'store-global'; id: number; path: ValuePath}
  /** List the children of the value at `path` on element `id`. */
  | {type: 'expand'; id: number; path: ValuePath}
  /**
   * Set a string, number or boolean on the reactive property `name` on
   * element `id`, then answer with fresh details. Applied only to a declared
   * property of that primitive type; anything else leaves the value as it was.
   * It is kept as an override (see {@link InspectorPropOverride}), switched
   * on. With `keys`, the primitive is written into the live object, array or
   * `Map` the property holds, at the end of that path: the steps from the
   * property's value down to the leaf, numbered as `expand` paths number
   * them. Absent or empty means the property itself.
   */
  | {
      type: 'set-prop';
      id: number;
      name: string;
      value: string | number | boolean;
      keys?: ValueSegment[];
    }
  /** Find the element `key` names, answered with a `located` message. */
  | {type: 'locate'; key: ElementKey}
  /** Ask for the page's overrides, answered with an `overrides` message. */
  | {type: 'overrides'}
  /**
   * Switch the override on `name` of element `id` on or off, keeping it, then
   * answer with fresh details and the overrides. With `keys`, the override
   * on that leaf inside the property's value, and the level holding it is
   * answered too.
   */
  | {
      type: 'override-toggle';
      id: number;
      name: string;
      keys?: ValueSegment[];
      enabled: boolean;
    }
  /**
   * Drop the override on `name` of element `id`, giving it back its
   * intrinsic value, then answer as `override-toggle` does.
   */
  | {type: 'override-remove'; id: number; name: string; keys?: ValueSegment[]}
  /**
   * Keep the override on `name` (or the leaf at `keys`) of element `id`
   * across reloads, or stop keeping it, then answer as `override-toggle`
   * does. Ignored where the host cannot keep anything.
   */
  | {
      type: 'override-persist';
      id: number;
      name: string;
      keys?: ValueSegment[];
      persist: boolean;
    }
  /**
   * Apply every override, or suspend them all without losing them, then
   * answer with the overrides.
   */
  | {type: 'overrides-apply'; applied: boolean}
  /**
   * Drop every override in the page, and the saved ones still waiting for
   * an element, then answer with the overrides.
   */
  | {type: 'overrides-clear'}
  /**
   * Draw element `id`'s slots and parts on the page; `null` clears it. With
   * `only`, draw just that slot or part region (labelled, in the focused
   * style) and no host outline or other regions: a hovered row while the
   * overlay is off.
   */
  | {type: 'anatomy'; id: number | null; only?: AnatomyFocus}
  /**
   * Emphasise one region of the anatomy overlay and fade the rest; `null` shows
   * them all evenly again.
   */
  | {type: 'anatomy-focus'; focus: AnatomyFocus | null}
  /**
   * Live tree: when enabled, the runtime watches the DOM and pushes a fresh
   * `tree` message whenever the component hierarchy changes, paced by what
   * a rebuild costs and held while the Timeline records. The Components
   * view turns it on while it is open; off otherwise.
   */
  | {type: 'observe'; enabled: boolean}
  /**
   * The last panel watching this page is gone: take down what panels left on
   * it (outlines, anatomy, breakpoints, the tree observer and the watch).
   * Sent by a host that sees a panel close before the page can, such as the
   * browser extension's background. Ignored while a panel on the in-page
   * channel is still connected.
   */
  | {type: 'release'}
  /**
   * Start the overlay's inspect-mode picker (the panel's "Pick" button). Handled
   * by the server (it broadcasts {@link INSPECT_OVERLAY_TOGGLE_CHANNEL}), not the
   * app runtime, so it never reaches the runtime's command handler.
   */
  | {type: 'pick'};

/**
 * The `globalThis` key under which the page runtime exposes `elementById`.
 * DevTools' `inspectedWindow.eval` runs in the page's main world and can only
 * pass the panel's numeric id as source text, so it reaches the node through
 * this to hand it to `inspect()`.
 */
export const ELEMENT_BY_ID_KEY = Symbol.for(
  '@oddsquad/vite-plugin-lit#element-by-id'
);

/**
 * The `globalThis` key under which the page runtime exposes the id of the
 * nearest element the Components tree lists at or above a node, crossing
 * shadow roots. The extension evaluates it on DevTools' `$0` so an Elements
 * selection selects the row it belongs to in the Lit panel.
 */
export const LIT_ID_OF_KEY = Symbol.for('@oddsquad/vite-plugin-lit#lit-id-of');

/**
 * What a breakpoint on one element pauses on: entering its `update()` or
 * `render()`, or a change to one of its reactive properties (one that
 * `hasChanged` accepts, so a write of the same value does not pause).
 */
export type BreakTarget =
  | {kind: 'method'; name: 'update' | 'render'}
  | {kind: 'prop'; name: string};

/**
 * The `globalThis` key under which the page runtime exposes its breakpoints
 * ({@link PageBreakpoints}). The extension sets them through
 * `inspectedWindow.eval`, which, like {@link ELEMENT_BY_ID_KEY}, can only
 * pass the panel's numeric id as source text.
 */
export const BREAKPOINTS_KEY = Symbol.for(
  '@oddsquad/vite-plugin-lit#breakpoints'
);

/** The page runtime's breakpoints, as {@link BREAKPOINTS_KEY} exposes them. */
export interface PageBreakpoints {
  /** Arm or disarm `target` on element `id`; false when it cannot be armed. */
  set(id: number, target: BreakTarget, on: boolean): boolean;
  /** Disarm every breakpoint on every element. */
  clear(): void;
}

/** HMR channel the server uses to forward a panel command to the app runtime. */
export const INSPECT_CMD_CHANNEL = 'lit:inspect:cmd';

/** HMR channel the app runtime uses to push an {@link InspectorMessage}. */
export const INSPECT_DATA_CHANNEL = 'lit:inspect:data';

/** Vite HMR channel the DevTools "inspect element" command broadcasts on. */
export const INSPECT_OVERLAY_TOGGLE_CHANNEL = 'lit-devtools:toggle-inspect';
