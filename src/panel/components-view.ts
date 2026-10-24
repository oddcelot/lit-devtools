import {
  LitElement,
  html,
  css,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import '../../packages/lit-components/src/badge.js';
import '../../packages/lit-components/src/button.js';
import '../../packages/lit-components/src/icon-button.js';
import '../../packages/lit-components/src/details.js';
import '../../packages/lit-components/src/input.js';
import './wa-icons.js';
import '../../packages/lit-components/src/split-panel.js';
import '../../packages/lit-components/src/switch.js';
import type {LitInput} from '../../packages/lit-components/src/input.js';
import type {LitSplitPanel} from '../../packages/lit-components/src/split-panel.js';
import type {LitSwitch} from '../../packages/lit-components/src/switch.js';
import {tokens} from '../lib/tokens.js';
import {
  ANATOMY_COLORS,
  type AnatomyElementRef,
  type AnatomyFocus,
  type BreakTarget,
  type ElementSource,
  type InspectorAnatomy,
  type InspectorDetails,
  type InspectorOverrideEntry,
  type InspectorProp,
  type InspectorPropOverride,
  type InspectorPropOption,
  type InspectorContext,
  type InspectorExtra,
  type InspectorMessage,
  type InspectorTreeNode,
  PAGE_RUNTIME_NAMES,
  sentenceStart,
  type ValueChild,
  type ValuePath,
  type ValueSegment,
} from '../types/inspector.js';
import {
  describeHmrReason,
  type HmrIncompatibilityEvent,
} from '../types/hmr-incompatibility.js';
import type {HmrPatchEvent} from '../types/hmr-patch.js';
import type {
  ComponentDocs,
  DocEntry,
  DocExample,
  DocsOrigin,
} from '../types/component-docs.js';
import {describeError, getMeta, litRpc} from './client.js';
import {ComponentsSession} from './components-session.js';
import {ComponentDocsSource} from './component-docs.js';
import {LocationController} from './location-controller.js';
import {PanelLocation} from './panel-location.js';
import {openInEditor} from './open-in-editor.js';
import {elementRevealer} from './element-revealer.js';
import {breakKey, breakpoints} from './breakpoints.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {sourceOpenerFor, sourceOpenerTip} from './source-opener.js';
import {hostInfo, sendToPage, touchPageChannel} from './host.js';
import {watchPaneVisibility} from './pane-visibility.js';
import {onFollowedElement} from './followed-element.js';
import {overrides} from './settings-override.js';
import {getTimelineEvents, subscribeTimeline} from './timeline-store.js';
import {elementActivity, type ElementActivity} from '../lib/timeline/model.js';
import type {TimelineEvent} from '../types/timeline.js';
import {
  docPlainText,
  renderDocInline,
  renderDocText,
  type Mark,
} from './doc-text.js';
import {formatLines, type ValueToken} from './value-format.js';
import {filterTree, type TreeFilterResult} from './tree-filter.js';
import {ValueExpansion} from './value-expansion.js';
import {copyText} from './copy-text.js';
import {
  attrKey,
  changedRows,
  extraKey,
  internalsKey,
  propKey,
} from './details-diff.js';
import {internalsRows} from './internals-rows.js';
import {
  fullSourceTip,
  manifestModuleOf,
  sourceText,
  SourceTextController,
  sourceTextStyles,
  sourceTip,
  type ManifestModule,
} from './source-text.js';

/**
 * localStorage key remembering a paused live tree. Live is the default, so
 * only an explicit `'false'` turns it off.
 */
/** localStorage key remembering the details pane's width in pixels. */
const DETAILS_WIDTH_LS_KEY = 'lit-devtools-components-details-width';
const DETAILS_WIDTH_DEFAULT = 340;
const DETAILS_WIDTH_MIN = 220;

/** localStorage key remembering that Anatomy was left on. */
const ANATOMY_LS_KEY = 'lit-devtools-components-anatomy';

/** Lit's dev-mode code for an update scheduled after an update completed. */
const CHANGE_IN_UPDATE = 'change-in-update';

const NO_ACTIVITY: ElementActivity = {selfCaused: 0, dispatched: []};

/** Whether two activities would render the same sections. */
const sameActivity = (a: ElementActivity, b: ElementActivity): boolean =>
  a.selfCaused === b.selfCaused &&
  a.dispatched.length === b.dispatched.length &&
  a.dispatched.every(
    (e, i) =>
      e.type === b.dispatched[i]!.type && e.count === b.dispatched[i]!.count
  );

const readAnatomy = (): boolean => {
  try {
    return localStorage.getItem(ANATOMY_LS_KEY) === 'true';
  } catch {
    return false;
  }
};

/** localStorage key listing the details sections the user folded. */
const COLLAPSED_LS_KEY = 'lit-devtools-components-collapsed';
/** About text longer than this starts clamped to a few lines. */
const ABOUT_CLAMP_CHARS = 240;

const readCollapsed = (): ReadonlySet<string> => {
  try {
    const list: unknown = JSON.parse(
      localStorage.getItem(COLLAPSED_LS_KEY) ?? '[]'
    );
    return new Set(
      Array.isArray(list)
        ? list.filter((x): x is string => typeof x === 'string')
        : []
    );
  } catch {
    return new Set();
  }
};

const readDetailsWidth = (): number => {
  try {
    const n = Number(localStorage.getItem(DETAILS_WIDTH_LS_KEY));
    return Number.isFinite(n) && n >= DETAILS_WIDTH_MIN
      ? Math.round(n)
      : DETAILS_WIDTH_DEFAULT;
  } catch {
    return DETAILS_WIDTH_DEFAULT;
  }
};

/** Values longer than this take a full line under their name. */
const WIDE_VALUE = 32;

/** The plain-text manifest description of the member called `name`, if any. */
const descriptionOf = (
  name: string,
  documented: readonly DocEntry[]
): string | undefined => {
  const description = documented.find((e) => e.name === name)?.description;
  return description === undefined ? undefined : docPlainText(description);
};

/** The first of a part's names the manifest documents, or `''` for none. */
const documentedPart = (
  names: readonly string[],
  documented: readonly DocEntry[]
): string => names.find((n) => documented.some((e) => e.name === n)) ?? '';

/**
 * Which anatomy rows a filter keeps, index for index. A slot matches on its
 * name (`default` for the unnamed one) or an assigned element's tag; a part
 * on its names or tag.
 */
const anatomyMatches = (
  a: InspectorAnatomy,
  matches: (...texts: string[]) => boolean
) => ({
  slots: a.slots.map((s) =>
    matches(
      s.name === '' ? 'default' : s.name,
      ...s.elements.map((e) => e.tagName)
    )
  ),
  orphans: a.orphans.map((o) =>
    matches(o.slot === '' ? 'no default slot' : `slot="${o.slot}"`, o.tagName)
  ),
  orphanText: a.orphanText > 0 && matches('no default slot'),
  parts: a.parts.map((p) =>
    matches(...p.names, p.tagName, ...(p.forwarded ? [p.forwarded.from] : []))
  ),
});

/** Distinct warned tags in the tree: Lit warns once per tag, not per instance. */
const warnedTagCount = (roots: readonly InspectorTreeNode[]): number => {
  const tags = new Set<string>();
  const walk = (nodes: readonly InspectorTreeNode[]): void => {
    for (const n of nodes) {
      if (n.warnings !== undefined && n.warnings > 0) tags.add(n.tagName);
      walk(n.children);
    }
  };
  walk(roots);
  return tags.size;
};

/** The row marker for a component Lit warned about; nothing when it hasn't. */
const warnedChip = (
  count: number | undefined
): TemplateResult | typeof nothing => {
  if (count === undefined || count === 0) return nothing;
  const noun = count === 1 ? 'warning' : 'warnings';
  const tip = `${count} Lit ${noun} \u2014 select to read ${count === 1 ? 'it' : 'them'}`;
  return html`<span class="status warned" data-tip=${tip}
    >${`${count} ${noun}`}</span
  >`;
};

const NOT_UPGRADED_TIP =
  'The tag is defined, but this element never became an instance of its class';

/**
 * The chip saying a defined tag gave this element no Lit state, if one does.
 * One another library defined carries none: the tree leaves it unmarked.
 * One the server rendered says it still shows that HTML: it never hydrates
 * either, which the chip covers instead of a hydration pill.
 */
const definedAsChip = (n: {
  notUpgraded?: true;
  ssr?: string;
}): TemplateResult | typeof nothing =>
  n.notUpgraded === true
    ? html`<span
        class="status not-upgraded"
        data-tip=${
          n.ssr === undefined
            ? NOT_UPGRADED_TIP
            : `${NOT_UPGRADED_TIP}, so it still shows the HTML the server sent`
        }
        >not upgraded</span
      >`
    : nothing;

/** One drop for every state: empty until the element hydrates, then filled. */
const HYDRATION_PILLS = {
  deferred: {
    text: 'deferred',
    icon: 'drop-simple',
    variant: 'warning',
    tip: 'Rendered on the server and held back by defer-hydration; it hydrates when the attribute is removed',
  },
  pending: {
    text: 'not hydrated',
    icon: 'drop-simple',
    variant: 'warning',
    tip: 'Rendered on the server; the first update, which hydrates it, has not run yet',
  },
  hydrated: {
    text: 'hydrated',
    icon: 'drop-simple-fill',
    variant: 'brand',
    tip: 'Rendered on the server and hydrated in the browser',
  },
} as const;

/**
 * Where a server-rendered element stands, as a pill; nothing for others,
 * and nothing for one that never upgraded: with no class behind it, it will
 * never hydrate, and its "not upgraded" chip says so.
 */
const hydrationPill = (n: {
  ssr?: keyof typeof HYDRATION_PILLS;
  notUpgraded?: true;
}): TemplateResult | typeof nothing => {
  if (n.ssr === undefined || n.notUpgraded === true) return nothing;
  const {text, icon, variant, tip} = HYDRATION_PILLS[n.ssr];
  return html`<lit-badge
    class="ssr ${n.ssr}"
    variant=${variant}
    pill
    data-tip=${tip}
    ><lit-icon name=${icon}></lit-icon>${text}</lit-badge
  >`;
};

/** An element the page gave no Lit state: nothing to update or render. */
const hasNoLitState = (d: InspectorDetails): boolean =>
  d.notDefined === true || d.notLit === true || d.notUpgraded === true;

/** Why the details pane has no reactive state to show, when it has none. */
const noStateNote = (d: InspectorDetails): TemplateResult | typeof nothing => {
  if (d.notDefined === true) {
    return html`<p class="not-defined-note">
      Nothing has called
      <code>customElements.define('${d.tagName}')</code>, so the browser treats
      this as an unknown element. Check that the component's module is imported
      and the tag is spelled the same in both places.
    </p>`;
  }
  if (d.notLit === true) {
    return html`<p class="not-defined-note">
      Defined, but not as a Lit component, so there are no reactive properties
      or updates to show. Attributes and slots are read from the page.
    </p>`;
  }
  if (d.notUpgraded === true) {
    return html`<p class="not-defined-note">
      <code>${d.tagName}</code> is defined, but this element was never upgraded
      to its class, so it has no state yet. Its constructor may have thrown
      (check the console), or it was created before the tag was defined and not
      connected
      since.${
        d.ssr === undefined
          ? nothing
          : ' It still shows the HTML the server sent, and will not hydrate.'
      }
    </p>`;
  }
  return nothing;
};

/**
 * `props` split by the class that declared them, the element's own class
 * first, in table order within each. One group with no class named when the
 * runtime named none (one class declared everything, or an older runtime).
 */
const byDeclaringClass = (
  props: readonly InspectorProp[]
): Array<{
  declaredBy?: InspectorProp['declaredBy'];
  props: InspectorProp[];
}> => {
  const groups = new Map<
    number,
    {declaredBy?: InspectorProp['declaredBy']; props: InspectorProp[]}
  >();
  for (const p of props) {
    const depth = p.declaredBy?.depth ?? 0;
    let group = groups.get(depth);
    if (group === undefined) {
      group = {...(p.declaredBy ? {declaredBy: p.declaredBy} : {}), props: []};
      groups.set(depth, group);
    }
    group.props.push(p);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([, group]) => group);
};

/** Ids of every node in the tree with this tag, in tree order. */
const idsWithTag = (
  roots: readonly InspectorTreeNode[],
  tagName: string
): number[] => {
  const ids: number[] = [];
  const visit = (n: InspectorTreeNode): void => {
    if (n.tagName === tagName) ids.push(n.id);
    n.children.forEach(visit);
  };
  roots.forEach(visit);
  return ids;
};

/** `text` with the first match of `query` wrapped in `<mark>`. */
const markMatch = (text: string, query: string): TemplateResult | string => {
  const q = query.trim().toLowerCase();
  const at = q === '' ? -1 : text.toLowerCase().indexOf(q);
  if (at < 0) return text;
  return html`${text.slice(0, at)}<mark>${text.slice(at, at + q.length)}</mark>${text.slice(at + q.length)}`;
};

const renderTokens = (tokens: ValueToken[]): TemplateResult[] =>
  tokens.map((t) =>
    t.kind === 'text'
      ? html`${t.text}`
      : html`<span class="t-${t.kind}">${t.text}</span>`
  );

/**
 * A serialized preview as coloured spans. A re-flowed preview renders one
 * block per line, indented by its depth with a hanging indent, so a long
 * string that wraps continues under its own text instead of at the margin.
 */
const renderCode = (
  value: string,
  /** Leads the first line, so a caret sits beside the value's opening. */
  lead: unknown = nothing
): TemplateResult | TemplateResult[] => {
  const lines = formatLines(value);
  if (lines.length === 1) return html`${lead}${renderTokens(lines[0]!.tokens)}`;
  return lines.map(
    (l, i) =>
      html`<span class="line" style="--indent:${l.indent}"
        >${i === 0 ? lead : nothing}${renderTokens(l.tokens)}</span
      >`
  );
};

/**
 * A second press of a double-click would select a word; stopping it on
 * mousedown leaves no selection to clear, and no flash of one. Only wired
 * on editable values, so the rest stay selectable.
 */
const keepSelection = (e: MouseEvent): void => {
  if (e.detail > 1) e.preventDefault();
};

/**
 * What an open value shows in place of its preview, since its children now
 * say the rest: `Array(3)`, `Map(2)`, a class name, or `Object`.
 */
const summarize = (type: string): TemplateResult =>
  html`<span class="t-type">${type === 'object' ? 'Object' : type}</span>`;

/**
 * A type name read off a preview, for a value whose type tag is not to hand:
 * `Map(2)` or `MyClass` from their prefix, else `Array` or `object`.
 */
const typeOfPreview = (value: string): string =>
  /^[A-Za-z_$][\w$.]*(?:\(\d+\))?/.exec(value)?.[0] ??
  (value.startsWith('[') ? 'Array' : 'object');

/** What a row needs to be set from the panel. */
interface PropEdit {
  name: string;
  /** Steps from the property's value to the leaf; empty for the row itself. */
  keys: ValueSegment[];
  kind: NonNullable<InspectorProp['editable']>;
  /** The value as typed: a boolean's `true`/`false`, else the raw text. */
  text: string;
}

/** What {@link editOf} reads: a property row, or a leaf below one. */
interface Editable {
  name: string;
  keys?: ValueSegment[];
  /** The preview as shown. */
  value: string;
  editable?: InspectorProp['editable'];
}

/** A property, or a leaf inside its value, that may carry an override. */
interface OverrideTarget {
  name: string;
  keys: readonly ValueSegment[];
  override?: InspectorPropOverride;
}

/** `name.key[0]`, as code would reach the value. */
const pathLabel = (name: string, keys: readonly ValueSegment[]): string =>
  name +
  keys
    .map((k) =>
      typeof k === 'number'
        ? `[${k}]`
        : /^[A-Za-z_$][\w$]*$/.test(k)
          ? `.${k}`
          : `[${JSON.stringify(k)}]`
    )
    .join('');

/**
 * What a child row can be written through: its edit and the override it may
 * carry. Only props are written to; an extra's children stay read-only.
 */
const childWrites = (
  path: ValuePath,
  c: ValueChild,
  snapshot: boolean
): {edit?: PropEdit; editKey?: string; target?: OverrideTarget} => {
  if (path.section !== 'prop') return {};
  const edit = editOf({...c, name: path.name, keys: path.keys}, snapshot);
  return {
    edit,
    editKey: edit === undefined ? undefined : editKeyOf(edit),
    target: {name: path.name, keys: path.keys, override: c.override},
  };
};

/** `one` for a single item, else the count and `many`. */
const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${n} ${many}`;

/** Dropped overrides as `<tag>.path` code spans, comma-separated. */
const dropList = (entries: readonly InspectorOverrideEntry[]) =>
  entries.map(
    (e, i) =>
      html`${i > 0 ? ', ' : ''}<code
          >&lt;${e.tagName}&gt;${pathLabel('', [e.name, ...(e.keys ?? [])])}</code
        >`
  );

/** The `_editing` key of a row: the property's own, or a leaf's path. */
const editKeyOf = (edit: Pick<PropEdit, 'name' | 'keys'>): string =>
  edit.keys.length === 0
    ? propKey(edit.name)
    : `${propKey(edit.name)}/${JSON.stringify(edit.keys)}`;

/**
 * Whether a property, or a leaf inside its value, can be set from the panel,
 * and its starting text. Not in a snapshot, which has no page. A string needs
 * a whole preview to start from: a truncated one is not the value, so it is
 * not offered.
 */
const editOf = (p: Editable, snapshot: boolean): PropEdit | undefined => {
  if (snapshot || p.editable === undefined) return undefined;
  const {name, keys = []} = p;
  const unset = p.value === 'null' || p.value === 'undefined';
  if (p.editable === 'string' && !unset) {
    try {
      const text: unknown = JSON.parse(p.value);
      return typeof text === 'string'
        ? {name, keys, kind: 'string', text}
        : undefined;
    } catch {
      return undefined;
    }
  }
  return {name, keys, kind: p.editable, text: unset ? '' : p.value};
};

/** Types the value's own spelling already shows, so no tag is needed. */
const SELF_EVIDENT_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'undefined',
  'null',
  'function',
  'object',
]);

/**
 * A muted type tag after a name, for values whose preview does not already
 * say what they are: `Array(3)` for `[1, 2, 3]`, but nothing for `"a"` or
 * `MyClass {…}`.
 */
const PROP_OPTION_TIPS: Record<InspectorPropOption, string> = {
  hasChanged: 'A custom hasChanged decides whether a set triggers an update',
  converter: 'A custom converter maps between the attribute and the property',
  noAccessor: 'noAccessor: Lit generates no accessor for this property',
  useDefault: 'useDefault: the initial value is not reflected to the attribute',
};

/** Badges for the options a property sets beyond Lit's defaults. */
const propOptionBadges = (p: InspectorProp): TemplateResult[] => {
  const badge = (label: string, tip: string) =>
    html`<lit-badge class="badge" variant="neutral" data-tip=${tip}
      >${label}</lit-badge
    >`;
  return [
    ...(p.attribute === false && !p.state
      ? [badge('no attr', 'attribute: false, so no attribute is observed')]
      : []),
    ...(p.options ?? []).map((o) => badge(o, PROP_OPTION_TIPS[o])),
  ];
};

/** The manifest's summary and description as one block, if it has either. */
const aboutText = (docs: ComponentDocs): string | undefined => {
  const text = [docs.summary, docs.description]
    .filter((t) => t !== undefined && t !== '')
    .join('\n\n');
  return text === '' ? undefined : text;
};

/**
 * The `@example`s as code blocks, each under its caption. An example that
 * holds a markdown fence is already markdown, so it renders as such.
 */
const renderExamples = (
  examples: readonly DocExample[],
  mark: Mark
): TemplateResult[] =>
  examples.map(
    (e) =>
      html`<div class="example">
        ${
          e.caption === undefined
            ? nothing
            : html`<div class="caption">${mark(e.caption)}</div>`
        }
        ${
          e.code.includes('```')
            ? renderDocText(e.code, mark)
            : html`<pre><code>${mark(e.code)}</code></pre>`
        }
      </div>`
  );

/** The selected element's manifest docs, as the details pane shows them. */
interface DocsView {
  docs: ComponentDocs | null;
  about?: string;
  /** The about text matches the row filter (or there is none). */
  aboutShown: boolean;
  /** Filtered by the row filter. */
  events: DocEntry[];
  cssProperties: DocEntry[];
  /** Unfiltered: these only lend descriptions to the live rows. */
  properties: readonly DocEntry[];
  attributes: readonly DocEntry[];
  slots: readonly DocEntry[];
  cssParts: readonly DocEntry[];
  anyMatch: boolean;
}

const NO_DOCS: DocsView = {
  docs: null,
  aboutShown: false,
  events: [],
  cssProperties: [],
  properties: [],
  attributes: [],
  slots: [],
  cssParts: [],
  anyMatch: false,
};

/** The manifest marks the component deprecated, with its reason if given. */
const deprecatedChip = (
  docs: ComponentDocs | null
): TemplateResult | typeof nothing => {
  const deprecated = docs?.deprecated;
  if (deprecated === undefined || deprecated === false) return nothing;
  return html`<span
    class="status warned"
    data-tip=${typeof deprecated === 'string' ? docPlainText(deprecated) : 'Marked deprecated in its manifest'}
    >deprecated</span
  >`;
};

/**
 * A path whose lines break only between directories: each `dir/` keeps
 * together and moves down whole, breaking inside only when it alone is
 * wider than the column. Plain wrapping split `packing-list.ts` at its
 * hyphen.
 */
const typeLabel = (
  type: string,
  value: string
): TemplateResult | typeof nothing =>
  SELF_EVIDENT_TYPES.has(type) || value.startsWith(type)
    ? nothing
    : html`<span class="type">${type}</span>`;

/**
 * The render root in a few words: `shadow, open, delegatesFocus`, or
 * `light DOM`. Undefined when the element has no render root yet.
 */
const describeRoot = (d: InspectorDetails): string | undefined => {
  const a = d.anatomy;
  if (a === undefined) return d.flags.hasShadowRoot ? 'shadow' : undefined;
  if (a.renderRoot === 'light') return 'light DOM';
  return ['shadow', a.mode, a.delegatesFocus === true ? 'delegatesFocus' : '']
    .filter(Boolean)
    .join(', ');
};

/**
 * The Components view: a hierarchical tree of the page's Lit elements (left)
 * and a details pane for the selected one (right). A tab of the DevTools panel
 * shell (\`lit-devtools-panel\`).
 *
 * It can't touch the page DOM directly (separate iframe), so it drives the
 * page's inspector runtime over devframe RPC: it calls the `inspect` action
 * with {@link InspectorCommand}s and receives {@link InspectorMessage}s
 * through the registered `inspector-message` client function. An overlay
 * inspect-pick arrives as a `pick` message; the view selects that node and
 * asks its host to switch to this tab.
 *
 * It also caches {@link HmrIncompatibilityEvent}s pushed over the
 * `hmr-incompatible` client function (primed from the node side's own cache
 * on connect, same as the tree) and renders them as a banner above the tree —
 * see "Cannot be patched in place" in the limitations docs for what these
 * mean. `hmr-count-change` bubbles the current count up to the panel shell so
 * it can badge the tab even while another tab is in front.
 */
@customElement('components-view')
export class ComponentsView extends LitElement {
  // Prints locations again once the project's root is known.
  protected readonly _sourceText = new SourceTextController(this);

  static override styles = [
    tokens,
    sourceTextStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
      }
      :host([hidden]) {
        display: none;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-4);
        padding: var(--lit-devtools-space-3) var(--lit-devtools-space-5);
        border-bottom: 1px solid var(--lit-devtools-border);
        background: var(--lit-devtools-surface-low);
        flex-shrink: 0;
      }
      .spacer {
        flex: 1;
      }
      /* The inputs carry a \`label\` for their accessible name; WA renders it
         visibly, and the placeholder or the text beside them already says it. */
      lit-input[label]::part(form-control-label),
      lit-select[label]::part(form-control-label) {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .toolbar lit-button,
      .toolbar lit-input {
        --wa-form-control-height: var(--lit-devtools-control-height);
      }
      .toolbar lit-button::part(base) {
        min-height: var(--lit-devtools-control-height);
      }
      lit-input.tree-filter {
        width: 200px;
        min-width: 120px;
        flex-shrink: 1;
        font-family: var(--lit-devtools-font-mono);
      }
      lit-input.tree-filter lit-icon[slot='start'],
      .match-count {
        color: var(--lit-devtools-text-muted);
      }
      .match-count {
        font-size: var(--lit-devtools-text-2xs);
      }
      .row.same-tag {
        background: var(--lit-devtools-accent-soft);
      }
      .row.context .tag {
        opacity: 0.55;
      }
      lit-split-panel {
        flex: 1;
        min-height: 0;
        --min: ${DETAILS_WIDTH_MIN}px;
        --max: calc(100% - 200px);
      }
      .tree {
        height: 100%;
        overflow: auto;
        padding: var(--lit-devtools-space-2) 0;
        min-width: 0;
      }
      .empty {
        padding: var(--lit-devtools-space-6);
        color: var(--lit-devtools-text-muted);
        font-size: var(--lit-devtools-text-xs);
      }
      .empty code {
        font-family: var(--lit-devtools-font-mono);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-2);
        box-sizing: border-box;
        min-height: var(--lit-devtools-row-height);
        padding: 1px var(--lit-devtools-space-5);
        white-space: nowrap;
        cursor: pointer;
        font-family: var(--lit-devtools-font-mono);
        font-size: var(--lit-devtools-text-xs);
        line-height: 18px;
      }
      .row:hover {
        background: var(--lit-devtools-surface-hover);
      }
      /* A brand tint plus a 2px bar, so the selection survives low contrast. */
      .row.selected {
        background: color-mix(
          in srgb,
          var(--lit-devtools-lit-blue) 18%,
          var(--lit-devtools-surface)
        );
        box-shadow: inset 2px 0 0 var(--lit-devtools-lit-blue);
      }
      .row.selected .tag {
        color: var(--lit-devtools-text-strong);
      }
      .row:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
        outline-offset: -2px;
      }
      .twisty {
        width: 12px;
        display: inline-flex;
        justify-content: center;
        color: var(--lit-devtools-text-muted);
        flex-shrink: 0;
      }
      .twisty lit-icon {
        font-size: 0.8em;
      }
      .tag {
        color: var(--lit-devtools-text);
      }
      .tag .punct {
        color: var(--lit-devtools-text-muted);
      }
      .details {
        height: 100%;
        box-sizing: border-box;
        overflow: auto;
        padding: var(--lit-devtools-space-5) var(--lit-devtools-space-5);
        font-size: var(--lit-devtools-text-xs);
        /* One key column for the whole pane: the meta list and every section's
           rows are subgrids of it, so all values start at the same x. */
        display: grid;
        grid-template-columns: fit-content(45%) minmax(0, 1fr);
        column-gap: var(--lit-devtools-space-4);
        align-content: start;
      }
      .details > * {
        grid-column: 1 / -1;
      }
      .details .head {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-3);
        margin: 0 0 var(--lit-devtools-space-3);
      }
      .details h2 {
        font-size: 15px;
        font-weight: var(--lit-devtools-weight-semibold);
        font-family: var(--lit-devtools-font-mono);
        color: var(--lit-devtools-text-strong);
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .details h2 .punct {
        color: var(--lit-devtools-text-muted);
      }
      .details .head .reveal {
        margin-left: auto;
      }
      /* Icon-only buttons keep a 24px hit area whatever the button size. */
      .details .head .reveal::part(base) {
        min-width: 24px;
        min-height: 24px;
      }
      .details .head .reveal + .reveal {
        margin-left: 0;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: var(--lit-devtools-space-2);
        flex-shrink: 0;
        font-size: var(--lit-devtools-text-2xs);
        color: var(--lit-devtools-text-muted);
        white-space: nowrap;
      }
      .status::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .name > .status {
        margin-left: var(--lit-devtools-space-3);
      }
      .status.task-pending {
        color: var(--lit-devtools-warning);
      }
      .status.task-complete {
        color: var(--lit-devtools-success);
      }
      .status.task-error {
        color: var(--lit-devtools-error);
      }
      .status.pending,
      .status.warned,
      .status.undefined,
      .status.not-upgraded {
        color: var(--lit-devtools-warning);
      }
      .row .status.undefined,
      .row .status.not-upgraded,
      .row .status.warned,
      .row lit-badge.ssr {
        margin-left: var(--lit-devtools-space-3);
      }
      /* A pill (the theme's one round shape), so the hydration state
         reads apart from the plain-text chips. */
      /* Sized in em so it scales with the label. The icon side's padding
         matches the vertical padding, which centres the round icon in the
         pill's round end; the text side gets about half the height, so the
         label clears the curve. */
      lit-badge.ssr {
        flex-shrink: 0;
        gap: 0.3em;
        font-size: calc(var(--lit-devtools-text-2xs) - 1px);
        font-weight: normal;
        line-height: 1;
        padding: 0.2em 0.6em 0.2em 0.2em;
      }
      /* Kept at the 2xs pill's size while the label shrinks. */
      lit-badge.ssr lit-icon {
        font-size: 1.2em;
      }
      .not-defined-note {
        margin: var(--lit-devtools-space-3) 0;
        color: var(--lit-devtools-text-muted);
        font-size: var(--lit-devtools-text-xs);
      }
      /* Prose, so the sans face, one block across both columns. */
      .about {
        grid-column: 1 / -1;
        margin-bottom: var(--lit-devtools-space-2);
        font-family: var(--lit-devtools-font-sans);
        color: var(--lit-devtools-text-secondary);
        line-height: var(--lit-devtools-leading-normal);
      }
      /* Doc prose, rendered from markdown: compact blocks, no outer margin. */
      .prose p,
      .prose ul,
      .prose ol,
      .prose pre {
        margin: 0 0 var(--lit-devtools-space-2);
      }
      .prose > :last-child {
        margin-bottom: 0;
      }
      .prose ul,
      .prose ol {
        padding-left: var(--lit-devtools-space-7);
      }
      .prose code {
        padding: 0 var(--lit-devtools-space-1);
        background: var(--lit-devtools-surface-container);
        font-family: var(--lit-devtools-font-mono);
        font-size: 0.92em;
      }
      .prose pre {
        padding: var(--lit-devtools-space-3);
        background: var(--lit-devtools-surface-container);
        overflow-x: auto;
      }
      .prose pre code {
        padding: 0;
        background: none;
        font-size: var(--lit-devtools-text-xs);
      }
      .prose a {
        color: var(--lit-devtools-accent);
      }
      .prose .example {
        margin-top: var(--lit-devtools-space-3);
      }
      .prose .caption {
        margin-bottom: var(--lit-devtools-space-1);
        font-size: var(--lit-devtools-text-2xs);
        color: var(--lit-devtools-text-muted);
      }
      .prose .example pre {
        margin-bottom: 0;
      }
      /* Blocks, not lines, so the clamp cuts at a height, faded out. */
      .about .prose.clamped {
        max-height: calc(4 * 1em * var(--lit-devtools-leading-normal));
        overflow: hidden;
        mask-image: linear-gradient(#000 60%, transparent);
      }
      .about .more {
        margin-top: var(--lit-devtools-space-1);
        padding: 0;
        border: 0;
        background: none;
        color: var(--lit-devtools-accent);
        font: inherit;
        cursor: pointer;
      }
      /* Where the docs came from: a quiet mark at the heading's end. A
         sibling of the summary, laid over its row, so it focuses on its own. */
      .section {
        position: relative;
      }
      .section > .origin {
        position: absolute;
        top: var(--lit-devtools-space-4);
        right: 0;
        display: inline-flex;
        padding: 0;
        border: 0;
        background: none;
        font-size: var(--lit-devtools-text-2xs);
        color: var(--lit-devtools-text-muted);
        cursor: help;
      }
      .section > .origin:hover,
      .section > .origin:focus-visible {
        color: var(--lit-devtools-text-secondary);
      }
      .section > .origin:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
        outline-offset: 2px;
        border-radius: 2px;
      }
      /* Documented names hint, faintly, that hovering explains them. */
      .described {
        text-decoration: underline dotted
          color-mix(in srgb, var(--lit-devtools-text-muted) 60%, transparent);
        text-underline-offset: 3px;
        cursor: help;
      }
      .described:hover {
        text-decoration-color: var(--lit-devtools-text-secondary);
      }
      /* A description shown under its row rather than on hover. */
      .doc-line {
        grid-column: 1 / -1;
        padding: 0 0 2px var(--lit-devtools-space-2);
        font-family: var(--lit-devtools-font-sans);
        font-size: var(--lit-devtools-text-xs);
        color: var(--lit-devtools-text-muted);
        white-space: normal;
      }
      .entry > .val.doc {
        font-family: var(--lit-devtools-font-sans);
        color: var(--lit-devtools-text-muted);
      }
      .warning {
        grid-column: 1 / -1;
        display: grid;
        gap: var(--lit-devtools-space-1);
        padding: var(--lit-devtools-space-2) 0;
      }
      .warning .code {
        font-family: var(--lit-devtools-font-mono);
        font-size: var(--lit-devtools-text-2xs);
        color: var(--lit-devtools-warning);
      }
      .warning .text {
        overflow-wrap: anywhere;
      }
      .break {
        display: inline-flex;
        align-items: center;
        gap: var(--lit-devtools-space-1);
        padding: 0 var(--lit-devtools-space-1);
        font: inherit;
        color: var(--lit-devtools-text-muted);
        background: none;
        border: 1px solid transparent;
        border-radius: var(--lit-devtools-radius-sm);
        cursor: pointer;
      }
      .break:hover {
        color: var(--lit-devtools-text);
      }
      .break[aria-pressed='true'] {
        color: var(--lit-devtools-error);
        border-color: currentColor;
      }
      /* A row's toggle shows on hover, and stays while armed. */
      .entry .break.icon {
        visibility: hidden;
      }
      .entry:hover .break.icon,
      .entry .break.icon:focus-visible,
      .entry .break.icon[aria-pressed='true'] {
        visibility: visible;
      }
      .break-on {
        display: flex;
        gap: var(--lit-devtools-space-2);
      }
      .meta {
        display: grid;
        grid-template-columns: subgrid;
        row-gap: var(--lit-devtools-space-1);
        margin: 0;
        font-family: var(--lit-devtools-font-mono);
      }
      .meta dt {
        color: var(--lit-devtools-text-muted);
      }
      .meta dd {
        margin: 0;
        min-width: 0;
        color: var(--lit-devtools-text-secondary);
        overflow-wrap: anywhere;
      }
      .link {
        font: inherit;
        color: var(--lit-devtools-text-link);
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
        text-align: left;
        overflow-wrap: anywhere;
      }
      .link:hover {
        text-decoration: underline;
      }
      .link:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
        outline-offset: 1px;
        border-radius: 2px;
      }
      .link lit-icon {
        margin-left: var(--lit-devtools-space-1);
        vertical-align: -0.125em;
      }
      .section {
        display: grid;
        grid-template-columns: subgrid;
        margin-top: var(--lit-devtools-space-5);
        padding-top: var(--lit-devtools-space-4);
        border-top: 1px solid var(--lit-devtools-border);
      }
      /* The section's rows are its grid items; the fold's content box is not.
         Without that box the browser has nothing to hide when the section
         closes, so the rows hide themselves. */
      .section::details-content {
        display: contents;
      }
      .section:not([open]) > :not(summary, .origin) {
        display: none;
      }
      .section > summary {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-2);
        margin-bottom: var(--lit-devtools-space-2);
        list-style: none;
        cursor: pointer;
        user-select: none;
        font-size: var(--lit-devtools-text-2xs);
        color: var(--lit-devtools-text-muted);
      }
      .section > summary::-webkit-details-marker {
        display: none;
      }
      .section > summary:hover {
        color: var(--lit-devtools-text-secondary);
      }
      .section > summary:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
        outline-offset: 2px;
        border-radius: 2px;
      }
      .section:not([open]) > summary {
        margin-bottom: 0;
      }
      summary .label {
        text-transform: uppercase;
        letter-spacing: var(--lit-devtools-tracking-caps);
      }
      summary .count {
        font-family: var(--lit-devtools-font-mono);
      }
      lit-input.filter {
        margin: var(--lit-devtools-space-4) 0 0;
        font-family: var(--lit-devtools-font-mono);
      }
      lit-input.filter lit-icon[slot='start'] {
        color: var(--lit-devtools-text-muted);
      }
      mark {
        background: var(--lit-devtools-warning-soft);
        color: inherit;
        border-radius: 2px;
      }
      .no-match {
        margin-top: var(--lit-devtools-space-5);
        color: var(--lit-devtools-text-muted);
      }
      .class-group {
        grid-column: 1 / -1;
        padding: var(--lit-devtools-space-2) 0 2px;
        color: var(--lit-devtools-text-muted);
        font-family: var(--lit-devtools-font-sans);
        font-size: var(--lit-devtools-text-2xs);
      }
      .class-group:first-child {
        padding-top: 0;
      }
      .kv {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        font-family: var(--lit-devtools-font-mono);
      }
      .entry {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        align-items: baseline;
        padding: 2px 0;
      }
      .entry,
      .child {
        position: relative;
      }
      .copy,
      .store {
        position: absolute;
        top: 0;
        right: 0;
        display: inline-flex;
        padding: 2px var(--lit-devtools-space-2);
        border: 0;
        border-radius: 2px;
        background: var(--lit-devtools-bg);
        color: var(--lit-devtools-text-muted);
        cursor: pointer;
        opacity: 0;
      }
      /* Left of the copy button: its padding plus one icon. */
      .store {
        right: calc(2 * var(--lit-devtools-space-2) + 1em);
      }
      /* Sits right after the value, so it is found where the eye already is. */
      .edit {
        display: inline-flex;
        vertical-align: middle;
        margin-left: var(--lit-devtools-space-1);
        padding: 0 2px;
        border: 0;
        border-radius: 2px;
        background: transparent;
        color: var(--lit-devtools-text-muted);
        cursor: pointer;
        opacity: 0;
      }
      /* Direct children only: an ancestor's hover must not reveal a leaf's. */
      .entry:hover > .copy,
      .entry:hover > .store,
      .entry:hover > .val > .edit,
      .child:hover > .t-value > .edit,
      .copy:focus-visible,
      .store:focus-visible,
      .edit:focus-visible,
      .copy.copied {
        opacity: 1;
      }
      .copy:hover,
      .store:hover,
      .edit:hover {
        color: var(--lit-devtools-text);
      }
      .copy.copied {
        color: var(--lit-devtools-success);
      }
      .copy:focus-visible,
      .store:focus-visible,
      .edit:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
      }
      .edit-input {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        text-indent: 0;
        padding: 0 var(--lit-devtools-space-2);
        border: 1px solid var(--lit-devtools-border);
        border-radius: 2px;
        background: var(--lit-devtools-surface);
        color: var(--lit-devtools-text);
        font: inherit;
      }
      .edit-input:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
      }
      .edit-input[aria-invalid='true'] {
        border-color: var(--lit-devtools-error);
      }
      .entry > .name {
        color: var(--lit-devtools-text);
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .entry > .val {
        color: var(--lit-devtools-warning);
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .entry > .val.code {
        color: var(--lit-devtools-text);
        white-space: pre-wrap;
      }
      /* A caret leads the first line, so the rest move over to match. */
      .val.has-caret .line:not(:first-child) {
        padding-left: calc((var(--indent) + 4) * 1ch);
      }
      /* Indent by depth; wrapped rows hang two columns further in. */
      .val .line {
        display: block;
        padding-left: calc((var(--indent) + 2) * 1ch);
        text-indent: -2ch;
      }
      .expander,
      .expander-space {
        display: inline-flex;
        width: 1.5ch;
        margin-right: 0.5ch;
        vertical-align: -0.1em;
      }
      .expander {
        padding: 0;
        border: 0;
        background: none;
        color: var(--lit-devtools-text-muted);
        cursor: pointer;
        font: inherit;
      }
      .expander:hover {
        color: var(--lit-devtools-text);
      }
      .expander:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
        border-radius: 2px;
      }
      .children {
        display: block;
        margin: 2px 0 2px 0.75ch;
        padding-left: 1.25ch;
        border-left: 1px solid var(--lit-devtools-border-subtle);
        white-space: normal;
        text-indent: 0;
      }
      /* Wrapped rows hang under the key, past the caret column. */
      .child {
        padding: 1px 0 1px 2ch;
        text-indent: -2ch;
      }
      .t-key {
        color: var(--lit-devtools-code-property);
      }
      .t-string {
        color: var(--lit-devtools-code-string);
      }
      .t-number {
        color: var(--lit-devtools-code-number);
      }
      .t-keyword {
        color: var(--lit-devtools-code-keyword);
      }
      .t-type,
      .t-tag {
        color: var(--lit-devtools-code-tag);
      }
      .t-callee {
        color: var(--lit-devtools-code-callee);
      }
      .t-punct,
      .t-muted {
        color: var(--lit-devtools-text-muted);
      }
      /* A wide row is two full lines, so neither half sizes the name column. */
      .entry.wide > .name {
        grid-column: 1 / -1;
      }
      .entry.wide > .val {
        grid-column: 1 / -1;
        padding-left: var(--lit-devtools-space-5);
      }
      /* Small tags beside a value: quiet text on a faint fill, no border. */
      .type {
        margin-left: var(--lit-devtools-space-2);
        padding: 0 var(--lit-devtools-space-2);
        font-size: 11px;
        color: var(--lit-devtools-text-muted);
        background: var(--lit-devtools-surface-container);
      }
      .badge {
        margin-left: var(--lit-devtools-space-2);
        vertical-align: middle;
        font-size: 11px;
        border: 0;
        padding: 0 var(--lit-devtools-space-2);
        background: var(--lit-devtools-surface-container);
        color: var(--lit-devtools-text-muted);
      }
      .swatch {
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: var(--lit-devtools-space-2);
        border-radius: 2px;
        vertical-align: middle;
      }
      .slot-default {
        font-style: italic;
      }
      .el-ref {
        font-family: var(--lit-devtools-font-mono);
        color: var(--lit-devtools-accent);
        background: none;
        border: 0;
        padding: 0;
        margin-right: var(--lit-devtools-space-2);
        font-size: inherit;
        cursor: pointer;
      }
      .ctx-links {
        margin-top: var(--lit-devtools-space-1);
      }
      .el-ref:disabled {
        color: var(--lit-devtools-text);
        cursor: default;
      }
      .entry.region:hover {
        background: var(--lit-devtools-surface-hover);
      }
      .entry.orphan > * {
        color: var(--lit-devtools-error);
      }
      .muted {
        color: var(--lit-devtools-text-muted);
      }
      .placeholder {
        color: var(--lit-devtools-text-muted);
        padding: var(--lit-devtools-space-8) 0;
        text-align: center;
      }
      .runtimes-banner {
        flex-shrink: 0;
        padding: var(--lit-devtools-space-2) var(--lit-devtools-space-5);
        border-bottom: 1px solid var(--lit-devtools-border);
        color: var(--lit-devtools-text-muted);
        font-size: var(--lit-devtools-text-xs);
      }
      .hmr-banner {
        flex-shrink: 0;
        background: var(--lit-devtools-error-soft);
      }
      lit-details.hmr-banner {
        --spacing: var(--lit-devtools-space-2) var(--lit-devtools-space-5);
        border: 0;
        border-radius: 0;
        border-bottom: 1px solid var(--lit-devtools-border);
        color: var(--lit-devtools-error);
        font-size: var(--lit-devtools-text-xs);
      }
      .hmr-banner [slot='summary'] {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-3);
        font-weight: var(--lit-devtools-weight-semibold);
      }
      .hmr-list {
        list-style: none;
        margin: 0;
        padding: 0 var(--lit-devtools-space-5) var(--lit-devtools-space-3);
        max-height: 160px;
        overflow-y: auto;
      }
      .hmr-item {
        display: flex;
        align-items: baseline;
        gap: var(--lit-devtools-space-3);
        padding: var(--lit-devtools-space-2) 0;
        border-top: 1px solid var(--lit-devtools-border-subtle);
        font-size: var(--lit-devtools-text-2xs);
      }
      .hmr-item:first-child {
        border-top: 0;
      }
      .hmr-reason {
        flex: 1;
        min-width: 0;
        color: var(--lit-devtools-text);
      }
      .hmr-last-patch {
        flex-shrink: 0;
        padding: var(--lit-devtools-space-2) var(--lit-devtools-space-5);
        border-bottom: 1px solid var(--lit-devtools-border);
        color: var(--lit-devtools-text-muted);
        font-size: var(--lit-devtools-text-2xs);
      }
      .hmr-outcome,
      .hmr-time {
        flex-shrink: 0;
        color: var(--lit-devtools-text-muted);
        white-space: nowrap;
      }
      /* The page's overrides: the switch for all of them, and their list. */
      .overrides-bar {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--lit-devtools-space-2) var(--lit-devtools-space-4);
        padding: var(--lit-devtools-space-2) var(--lit-devtools-space-5);
        border-bottom: 1px solid var(--lit-devtools-border);
        background: var(--lit-devtools-accent-soft);
        font-size: var(--lit-devtools-text-xs);
      }
      .overrides-dropped {
        flex-basis: 100%;
        display: flex;
        align-items: baseline;
        gap: var(--lit-devtools-space-2);
        color: var(--lit-devtools-warning);
      }
      .overrides-dropped > span {
        flex: 1;
        min-width: 0;
      }
      .overrides-bar > details {
        flex: 1;
        min-width: 0;
      }
      .overrides-bar summary {
        cursor: pointer;
        color: var(--lit-devtools-text);
      }
      .overrides-list {
        flex-basis: 100%;
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 160px;
        overflow-y: auto;
        font-family: var(--lit-devtools-font-mono);
        font-size: var(--lit-devtools-text-2xs);
      }
      .overrides-list li {
        display: flex;
        align-items: baseline;
        gap: var(--lit-devtools-space-2);
        padding: 2px 0;
      }
      .overrides-list li.off .override-value {
        text-decoration: line-through;
        color: var(--lit-devtools-text-muted);
      }
      .overrides-list .tag {
        padding: 0;
        border: 0;
        background: none;
        color: var(--lit-devtools-accent);
        font: inherit;
        cursor: pointer;
      }
      .override-value {
        min-width: 0;
        overflow-wrap: anywhere;
        color: var(--lit-devtools-warning);
      }
      .override-toggle {
        margin: 0 var(--lit-devtools-space-2) 0 0;
        vertical-align: middle;
      }
      /* Whichever of override and intrinsic value is not in effect. */
      .shadowed {
        margin-left: var(--lit-devtools-space-2);
        color: var(--lit-devtools-text-muted);
        text-decoration: line-through;
      }
      .remove-override {
        display: inline-flex;
        vertical-align: middle;
        margin-left: var(--lit-devtools-space-1);
        padding: 0 2px;
        border: 0;
        border-radius: 2px;
        background: transparent;
        color: var(--lit-devtools-text-muted);
        cursor: pointer;
      }
      .remove-override:hover,
      .pin-override:hover {
        color: var(--lit-devtools-text);
      }
      .pin-override {
        display: inline-flex;
        vertical-align: middle;
        margin-left: var(--lit-devtools-space-1);
        padding: 0 2px;
        border: 0;
        border-radius: 2px;
        background: transparent;
        color: var(--lit-devtools-text-muted);
        cursor: pointer;
      }
      .pin-override.pinned {
        color: var(--lit-devtools-accent);
      }
      .pin-override:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
      }
      .overrides-bar .waiting {
        color: var(--lit-devtools-text-muted);
      }
      .remove-override:focus-visible,
      .overrides-list .tag:focus-visible {
        outline: 2px solid var(--lit-devtools-accent-ring);
      }
    `,
  ];

  /**
   * The tree, the selection, Live, the picker and the HMR notices, and the
   * rules that keep the page in step with them. This element renders it.
   */
  private readonly _session = new ComponentsSession({
    send: sendToPage,
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    // A selection is part of "where the panel is": the shell writes it
    // into the URL, and a link that drops it would reopen the wrong view.
    onSelect: (id) => this.location.select('components', id),
    // Bring this tab to the front so the pick is visible. Bringing the dock
    // itself forward is the host's job: the node side activates it when it
    // forwards the pick (see lib/devframe/vite.ts).
    onPicked: () => this.location.setTab('components'),
  });

  /** Where the panel is; the shell hands its own in. */
  @property({attribute: false}) location = new PanelLocation();
  /**
   * Just the details pane, following the element a host's own inspector
   * selects (`followed-element.ts`): the browser extension's Lit tab in the
   * Elements sidebar. No tree, no toolbar.
   */
  @property({type: Boolean, attribute: 'details-only'}) detailsOnly = false;
  private _unfollow: (() => void) | null = null;

  // A link that names an element: select it now. The tree may not hold it
  // yet; the session reveals it once a fresh tree arrives.
  protected readonly _locationController = new LocationController(this, () => {
    const id = this.location.requested('components');
    if (id === undefined) return;
    this._session.select(id);
    this.location.resolve('components', id);
  });
  /**
   * Whether the page has a picker to toggle, as `get-meta` reports it: the
   * source overlay under Vite (only with `sourceOverlay` on), the standalone
   * script's own under `lit-devtools dev`. A frozen snapshot has no page, and
   * a Pick button with no picker behind it would light up and do nothing.
   */
  @state() private _canPick = false;
  /** Whether a source location opens in the editor, as `get-meta` reports
   *  it; otherwise the location is shown as plain text. */
  @state() private _canOpen = false;
  /** The host reads Custom Elements Manifests (`component-docs`). */
  @state() private _canReadDocs = false;
  /** The tag whose long About text is shown in full; reset by another tag. */
  @state() private _aboutOpenFor: string | null = null;
  private readonly _docs = new ComponentDocsSource(() => this.requestUpdate());
  /** A frozen snapshot: no page to reveal elements in or explain. */
  @state() private _snapshot = false;
  /** Mirror of the `flashUpdates` override; the Settings tab shows it too. */
  @state() private _flash = false;
  /** Show member descriptions under their rows rather than on hover. */
  @state() private _inlineDocs = false;
  /** Draw the selected element's slots and parts on the page; remembered. */
  @state() private _anatomy = readAnatomy();
  /** What the page is drawing (see `_anatomyKey`), `null` for nothing. */
  private _anatomyShown: string | null = null;
  /** The dock has hidden the panel; nothing it drew should stay on the page. */
  private _paneHidden = false;
  private _unwatchPane: (() => void) | null = null;
  /** The slot or part row under the pointer; drawn alone while Anatomy is off. */
  @state() private _hoveredRegion: AnatomyFocus | null = null;
  /** Set when the devframe connection fails; rendered in place of the tree. */
  @state() private _error: string | null = null;
  /**
   * Narrows every details section to rows whose name or value contains it,
   * case-insensitively. Kept across selections, so comparing one row on
   * several elements needs no retyping.
   */
  @state() private _query = '';
  /**
   * Narrows the tree to elements whose tag or class name contains it, with
   * their ancestors for context. Never touches the remembered expansion.
   */
  @state() private _treeQuery = '';
  /** Details sections the user folded, by label. */
  @state() private _collapsed: ReadonlySet<string> = readCollapsed();
  /** Collapse state of the banner; the events themselves are never cleared. */
  @state() private _hmrExpanded = true;
  /** Details pane width in pixels, restored once; the split panel owns it
   *  after that and `_saveDetailsWidth` persists each drag. */
  private readonly _detailsWidth = readDetailsWidth();
  private _unsubscribeOverride: (() => void) | null = null;
  private _unsubscribeSession: (() => void) | null = null;
  private _unsubscribeTimeline: (() => void) | null = null;
  /**
   * Breakpoints armed on the selected element, by {@link breakKey}. Cleared,
   * in the page too, when the selection moves: a breakpoint left on an
   * element the panel no longer shows would pause with nothing to say why.
   */
  @state() private _breaks: ReadonlySet<string> = new Set();
  /**
   * Per element id, what the recording shows it doing (double renders,
   * dispatched events), for the Warnings and Dispatched sections. Derived on
   * demand and kept for the buffer it came from: the view stays mounted
   * behind other tabs, so a busy recording must not re-derive (or re-render)
   * it on every batch.
   */
  private _activity: {
    events: readonly TimelineEvent[];
    byId: ReadonlyMap<number, ElementActivity>;
  } | null = null;
  /** The activity the details last showed, keyed to its element. */
  private _shownActivity: {id: number; activity: ElementActivity} | null = null;
  /** The tree row under the pointer, so Shift can act on it. */
  private _hovered: InspectorTreeNode | null = null;
  /** The tag whose rows are marked while Shift-hovering, or null. */
  @state() private _tagHover: string | null = null;
  /** The row (by `propKey`) whose value is being typed over, if any. */
  @state() private _editing: string | null = null;
  /** Whether what was typed was refused, so the input says so. */
  @state() private _editInvalid = false;
  /** The row whose value was just copied, for a moment of feedback. */
  @state() private _copied: string | null = null;
  private _copiedTimer: ReturnType<typeof setTimeout> | undefined;
  /** Values opened in the details pane, and their children. */
  private readonly _expansion = new ValueExpansion(sendToPage, () =>
    this.requestUpdate()
  );
  /** The details last rendered, to tell which rows a refresh changed. */
  private _shownDetails: InspectorDetails | null = null;
  /** Rows to highlight once the render that changed them lands. */
  private _pendingFlash = new Set<string>();
  private _reportedIncompatibilities: unknown = null;
  private _reportedWarningRoots: unknown = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this._onShift);
    window.addEventListener('keyup', this._onShift);
    window.addEventListener('pagehide', this._onPageHide);
    // Reconnected: `willUpdate` only follows when `detailsOnly` changes.
    if (this.detailsOnly && this._unfollow === null) this._follow();
    this._unwatchPane = watchPaneVisibility((visible) => {
      // Another view on the page may have taken the watch meanwhile.
      if (visible && this._paneHidden) this._session.rewatch();
      this._paneHidden = !visible;
      if (!visible) this._highlight(null);
      // `updated` takes the anatomy down, or draws it again.
      this.requestUpdate();
    });
    this._unsubscribeSession = this._session.subscribe(() => {
      this.requestUpdate();
      this._reportIncompatibilities();
      this._reportWarnings();
    });
    this._flash = overrides.get().flashUpdates ?? false;
    this._inlineDocs = overrides.get().inlineDocs ?? false;
    this._unsubscribeOverride = overrides.subscribe((o) => {
      this._flash = o.flashUpdates ?? false;
      this._inlineDocs = o.inlineDocs ?? false;
    });
    this._unsubscribeTimeline = subscribeTimeline(() => {
      const shown = this._shownActivity;
      if (
        shown !== null &&
        !sameActivity(this._activityOf(shown.id), shown.activity)
      ) {
        this.requestUpdate();
      }
    });
    void this._connect();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._onShift);
    window.removeEventListener('keyup', this._onShift);
    window.removeEventListener('pagehide', this._onPageHide);
    this._unwatchPane?.();
    this._unwatchPane = null;
    this._unfollow?.();
    this._unfollow = null;
    this._unsubscribeOverride?.();
    this._unsubscribeOverride = null;
    this._unsubscribeSession?.();
    this._unsubscribeSession = null;
    this._unsubscribeTimeline?.();
    this._unsubscribeTimeline = null;
    this._releasePage();
  }

  /** Drop what the page keeps for this panel: watch, Live, overlays, breaks. */
  private _releasePage(): void {
    this._session.dispose();
    this._syncAnatomy(null, null);
    this._highlight(null);
    this._clearBreaks();
  }

  /**
   * A panel in its own tab has no in-page channel, so the page never hears
   * it close and would keep the anatomy overlay, Live and the watch. Closing
   * the tab tears nothing down, but `pagehide` still runs and its RPC calls
   * go out. Kept while the page enters the back/forward cache, which it may
   * leave again.
   */
  private readonly _onPageHide = (e: PageTransitionEvent): void => {
    if (!e.persisted) this._releasePage();
  };

  private _clearBreaks(): void {
    if (this._breaks.size === 0) return;
    this._breaks = new Set();
    void breakpoints()?.clear();
  }

  /** Arm or disarm `target` on the shown element; kept off if the page refused. */
  private async _toggleBreak(target: BreakTarget): Promise<void> {
    const bp = breakpoints();
    const id = this._shownDetails?.id;
    if (bp === undefined || id === undefined) return;
    const key = breakKey(target);
    const on = !this._breaks.has(key);
    const armed = await bp.set(id, target, on);
    // The selection may have moved while the page answered.
    if (this._shownDetails?.id !== id) return;
    const next = new Set(this._breaks);
    if (on && armed) next.add(key);
    else next.delete(key);
    this._breaks = next;
  }

  /** A toggle that pauses on `target`, with `label` as its text or tip. */
  private _renderBreak(
    target: BreakTarget,
    tip: string,
    label?: string
  ): TemplateResult {
    const on = this._breaks.has(breakKey(target));
    return html`<button
      class="break ${label === undefined ? 'icon' : ''}"
      aria-pressed=${on ? 'true' : 'false'}
      aria-label=${label === undefined ? tip : nothing}
      data-tip=${tip}
      @click=${(e: Event) => {
        e.stopPropagation();
        void this._toggleBreak(target);
      }}
    >
      <lit-icon name="pause-circle"></lit-icon>${label ?? nothing}
    </button>`;
  }

  /** The "break on" line: pause in `update()` or `render()`, where the host can. */
  private _renderBreakOn(d: InspectorDetails): TemplateResult | typeof nothing {
    if (breakpoints() === undefined || this._snapshot || hasNoLitState(d))
      return nothing;
    return html`<dt>break on</dt>
      <dd class="break-on">
        ${this._renderBreak(
          {kind: 'method', name: 'update'},
          'Pause in the debugger when this element enters update()',
          'update'
        )}
        ${this._renderBreak(
          {kind: 'method', name: 'render'},
          'Pause in the debugger when this element enters render()',
          'render'
        )}
      </dd>`;
  }

  /** In details-only mode, select whatever the host inspector selects. */
  private _follow(): void {
    this._unfollow?.();
    this._unfollow = this.detailsOnly
      ? onFollowedElement((id) => {
          if (id === null) this._session.deselect();
          else this._session.select(id);
        })
      : null;
  }

  /** A property row's breakpoint, where the host can set one. */
  private _renderPropBreak(p: InspectorProp): TemplateResult | typeof nothing {
    if (breakpoints() === undefined || this._snapshot) return nothing;
    return this._renderBreak(
      {kind: 'prop', name: p.name},
      `Pause in the debugger when ${p.name} changes`
    );
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('detailsOnly')) this._follow();
    const d = this._session.details;
    if (d === this._shownDetails) return;
    this._expansion.follow(d?.id ?? null);
    if (d?.id !== this._shownDetails?.id) {
      this._editing = null;
      this._hoveredRegion = null;
      this._clearBreaks();
    }
    // Only a refresh of the same element can change a row; a new selection
    // or the first snapshot flashes nothing. A changed row also re-asks for
    // whatever is open under it.
    for (const key of changedRows(this._shownDetails, d)) {
      this._pendingFlash.add(key);
      const name = key.slice(2);
      if (key === propKey(name)) this._expansion.refresh('prop', name);
      else if (key === extraKey(name)) this._expansion.refresh('extra', name);
    }
    this._shownDetails = d;
  }

  protected override updated(): void {
    this._flashChangedRows();
    const id = this._snapshot ? null : this._session.selectedId;
    this._syncAnatomy(id, this._anatomy ? null : this._hoveredRegion);
  }

  /**
   * Fade a highlight out of each row whose value just changed. The Web
   * Animations API restarts cleanly when a value changes again mid-fade,
   * which a CSS class would not. A colour fade without motion, so it runs
   * under reduced motion too.
   */
  private _flashChangedRows(): void {
    if (this._pendingFlash.size === 0) return;
    const keys = this._pendingFlash;
    this._pendingFlash = new Set();
    for (const row of this.renderRoot.querySelectorAll<HTMLElement>(
      '.details .entry[data-key]'
    )) {
      if (!keys.has(row.dataset['key']!) || typeof row.animate !== 'function') {
        continue;
      }
      // Keyframes take resolved colours, not var() references.
      const from = getComputedStyle(row)
        .getPropertyValue('--lit-devtools-warning-soft')
        .trim();
      row.animate(
        [
          {backgroundColor: from || 'transparent'},
          {backgroundColor: 'transparent'},
        ],
        {duration: 1200, easing: 'ease-out'}
      );
    }
  }

  /**
   * Point the page's anatomy overlay at `id`, or clear it for `null`: all of
   * it with Anatomy on, just the hovered region (`only`) with it off.
   */
  private _syncAnatomy(id: number | null, only: AnatomyFocus | null): void {
    if ((!this._anatomy && only === null) || this._paneHidden) id = null;
    const region = only === null ? '' : `${only.kind}:${only.index}`;
    const key = id === null ? null : `${id}|${region}`;
    if (key === this._anatomyShown) return;
    this._anatomyShown = key;
    sendToPage(
      id === null
        ? {type: 'anatomy', id}
        : {type: 'anatomy', id, ...(only === null ? {} : {only})}
    );
  }

  /**
   * Let the panel shell badge the Components tab even while another tab is
   * in front — the same cross-tab visibility an overlay pick gets by switching
   * tabs, but passive: no tab switch.
   */
  private _reportIncompatibilities(): void {
    const list = this._session.hmrIncompatibilities;
    if (list === this._reportedIncompatibilities) return;
    this._reportedIncompatibilities = list;
    this.dispatchEvent(
      new CustomEvent('hmr-count-change', {
        detail: {count: list.length},
        bubbles: true,
        composed: true,
      })
    );
  }

  /** Tell the panel shell how many distinct components Lit warned about. */
  private _reportWarnings(): void {
    const roots = this._session.roots;
    if (roots === this._reportedWarningRoots) return;
    this._reportedWarningRoots = roots;
    this.dispatchEvent(
      new CustomEvent('warning-count-change', {
        detail: {count: warnedTagCount(roots)},
        bubbles: true,
        composed: true,
      })
    );
  }

  /** Count of cached HMR-incompatibility events; the panel shell's tab badge. */
  // Read by the panel-shell and components-view DOM tests.
  // fallow-ignore-next-line unused-class-member
  get hmrIncompatibilityCount(): number {
    return this._session.hmrIncompatibilities.length;
  }

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  /**
   * Connects to the shared devframe client and registers the node → panel
   * `inspector-message` and `hmr-incompatible` pushes. Primes the tree and
   * the HMR-incompatibility list from the node side's caches (so a panel
   * opened after the page loaded isn't blank), then requests a fresh tree —
   * mirroring the old SSE `open` handler, which kicked off the first `tree`
   * request only once the stream was subscribed.
   */
  private async _connect(): Promise<void> {
    try {
      const rpc = await litRpc();
      rpc.rpc.register({
        name: 'inspector-message',
        type: 'event',
        handler: (message: InspectorMessage) => {
          if (message.type === 'expanded') this._expansion.receive(message);
          else this._session.receive(message);
        },
      });
      rpc.rpc.register({
        name: 'hmr-incompatible',
        type: 'event',
        handler: (event: HmrIncompatibilityEvent) =>
          this._session.hmrIncompatible(event),
      });
      rpc.rpc.register({
        name: 'hmr-patched',
        type: 'event',
        handler: (event: HmrPatchEvent) => {
          this._session.hmrPatched(event);
          this._docs.refresh(event.tagName);
        },
      });
      rpc.rpc.register({
        name: 'component-docs-changed',
        type: 'event',
        handler: () => this._docs.reload(),
      });
      void hostInfo().then((host) => {
        this._canPick = host.picker;
        this._canOpen = host.openInEditor;
        this._canReadDocs = host.componentDocs;
        this._snapshot = host.snapshot;
      });
      void getMeta().then(
        (meta) => this._session.setRuntime(meta.runtime),
        () => {
          // No meta: the empty tree goes unexplained.
        }
      );
      const roots = await rpc.rpc.call('list-components');
      const hmrIncompatibilities = await rpc.rpc.call('hmr-incompatibilities');
      // A session dumped by an earlier version has no history baked in; the
      // patch line simply stays hidden.
      const hmrHistory = await rpc.rpc.call('hmr-history').then(
        (history) => history.entries,
        () => undefined
      );
      // The tree baked into a frozen session is all it has: `sendToPage` drops the
      // commands this sends, since asking the page would reject.
      this._session.connected({roots, hmrIncompatibilities, hmrHistory});
      if (this._session.live) touchPageChannel();
    } catch (err) {
      this._error = describeError(err);
    }
  }

  /**
   * Why the tree is empty, from the most specific cause the runtime's
   * announcement allows. A frozen snapshot has no runtime to ask about.
   */
  private _renderEmpty() {
    const runtime = this._snapshot ? null : this._session.runtime;
    if (runtime !== null && !runtime.ready) {
      return html`<div class="empty">
        The page runtime has not connected to this dev server. Open the page
        through this dev server and check that <code>timeline</code> is on (or
        <code>LIT_PLUGIN_TIMELINE=true</code>), then reload. If it stays empty,
        look for a failed script in the browser console.
      </div>`;
    }
    const duplicate =
      runtime === null
        ? undefined
        : Object.entries(runtime.litPackages).find(([, v]) => v.length > 1);
    if (duplicate !== undefined) {
      const [name, versions] = duplicate;
      return html`<div class="empty">
        More than one copy of lit is loaded (${name} ${versions.join(', ')}).
        Components registered against a different copy cannot be inspected or
        patched. Dedupe lit in your bundler with
        <code>resolve.dedupe: ['lit']</code>.
      </div>`;
    }
    if (runtime !== null && !runtime.topFrame) {
      return html`<div class="empty">
        The runtime is running inside an iframe, so this tree only shows that
        frame's components. Open the page that owns the components directly.
      </div>`;
    }
    return html`<div class="empty">No Lit components found on the page.</div>`;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  /** Another page took over (see the shell's `page-changed` listener). */
  pageChanged(): void {
    this._session.pageChanged();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private _togglePick(): void {
    this._session.togglePick();
  }

  private _toggleLive(): void {
    this._session.toggleLive();
    // Connect the lazy in-page channel so the page can see the panel leave.
    if (this._session.live) touchPageChannel();
  }

  /**
   * Flash-on-update is a settings override, not an inspector command: the
   * page runtime reads it at boot (so it survives reloads) and gets live
   * pushes, and the Settings tab mirrors the same switch.
   */
  private _toggleFlash(): void {
    overrides.set('flashUpdates', !this._flash);
  }

  private _toggleAnatomy(): void {
    this._anatomy = !this._anatomy;
    this._hoveredRegion = null;
    try {
      localStorage.setItem(ANATOMY_LS_KEY, String(this._anatomy));
    } catch {
      // Storage unavailable: the toggle just won't be remembered.
    }
  }

  /** Outline an element in the page; fires on every `mouseenter` in the tree. */
  private _highlight(id: number | null): void {
    sendToPage({type: 'highlight', id});
  }

  /**
   * Outline a hovered tree row's element on the page, or with Shift held,
   * every element with the same tag, and mark their rows here.
   */
  private _hoverRow(node: InspectorTreeNode, all: boolean): void {
    this._hovered = node;
    if (!all) {
      this._tagHover = null;
      this._highlight(node.id);
      return;
    }
    this._tagHover = node.tagName;
    sendToPage({
      type: 'highlight-all',
      ids: idsWithTag(this._session.roots, node.tagName),
    });
  }

  private readonly _leaveTree = (): void => {
    this._hovered = null;
    this._tagHover = null;
    this._highlight(null);
  };

  /** Shift pressed or released over a row switches between one and all. */
  private readonly _onShift = (e: KeyboardEvent): void => {
    if (e.key !== 'Shift' || e.repeat || this._hovered === null) return;
    this._hoverRow(this._hovered, e.type === 'keydown');
  };

  /** Single out a slot or part in the page's anatomy overlay while hovered. */
  private _focusRegion(focus: AnatomyFocus | null): void {
    this._hoveredRegion = focus;
    if (this._anatomy) sendToPage({type: 'anatomy-focus', focus});
  }

  /** Ask the selected element to update; the tick's cause names the DevTools. */
  private _requestUpdate(): void {
    const id = this._session.details?.id;
    if (id !== undefined) sendToPage({type: 'request-update', id});
  }

  /** Scroll the selected element into view in the page. */
  private _reveal(): void {
    const id = this._session.details?.id;
    if (id !== undefined) sendToPage({type: 'reveal', id});
  }

  private _saveDetailsWidth(e: Event): void {
    const width = Math.round((e.target as LitSplitPanel).positionInPixels);
    if (!(width >= DETAILS_WIDTH_MIN)) return;
    try {
      localStorage.setItem(DETAILS_WIDTH_LS_KEY, String(width));
    } catch {
      // Storage unavailable: the width just won't be remembered.
    }
  }

  private _onHmrToggle(e: Event): void {
    // wa-show/wa-hide also bubble from nested lit-details; only ours counts.
    if (e.target !== e.currentTarget) return;
    this._hmrExpanded = (e.target as HTMLElement).hasAttribute('open');
  }

  private _openSource(): void {
    const src = this._session.details?.source;
    if (src === undefined) return;
    // Resolved through the page's sourcemaps: DevTools has it, no editor does.
    const opener = sourceOpenerFor(src, this._canOpen);
    if (opener !== undefined) void opener(src);
    else void openInEditor(src.file, src.line);
  }

  private _openCallSite(): void {
    const site = this._session.details?.callSite;
    if (site === undefined) return;
    const opener = sourceOpenerFor(site, this._canOpen);
    if (opener !== undefined) void opener(site);
    else void openInEditor(site.file, site.line, site.column);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /**
   * One tree row and, when expanded, its children. With a filter, only kept
   * nodes render, every kept node shows open, and the twisty does nothing,
   * so the user's own expansion is back as it was once the filter clears.
   */
  private _renderNode(
    node: InspectorTreeNode,
    depth: number,
    filter?: TreeFilterResult
  ): TemplateResult | typeof nothing {
    if (filter !== undefined && !filter.keep.has(node.id)) return nothing;
    const children =
      filter === undefined
        ? node.children
        : node.children.filter((c) => filter.keep.has(c.id));
    const hasChildren = children.length > 0;
    const expanded =
      filter !== undefined || this._session.expanded.has(node.id);
    const dimmed = filter !== undefined && !filter.matched.has(node.id);
    const selected = node.id === this._session.selectedId;
    return html`
      <div
        class="row ${selected ? 'selected' : ''} ${
          dimmed ? 'context' : ''
        } ${this._tagHover === node.tagName ? 'same-tag' : ''}"
        role="treeitem"
        aria-level=${depth + 1}
        aria-selected=${selected ? 'true' : 'false'}
        aria-expanded=${hasChildren ? (expanded ? 'true' : 'false') : nothing}
        tabindex=${node.id === (this._session.selectedId ?? this._session.roots[0]?.id) ? 0 : -1}
        style="padding-left:${8 + depth * 14}px"
        @click=${() => this._session.select(node.id)}
        data-id=${node.id}
        @keydown=${(e: KeyboardEvent) =>
          this._onRowKeydown(
            e,
            node.id,
            hasChildren && filter === undefined ? expanded : undefined
          )}
        @mouseenter=${(e: MouseEvent) => this._hoverRow(node, e.shiftKey)}
      >
        <span
          class="twisty"
          @click=${(e: Event) => {
            e.stopPropagation();
            if (filter === undefined) this._session.toggleExpand(node.id);
          }}
          >${
            hasChildren
              ? html`<lit-icon
                  name=${expanded ? 'caret-down' : 'caret-right'}
                ></lit-icon>`
              : nothing
          }</span
        >
        <span class="tag"
          ><span class="punct">&lt;</span>${
            filter === undefined
              ? node.tagName
              : markMatch(node.tagName, this._treeQuery)
          }<span class="punct">&gt;</span></span
        >
        ${
          node.notDefined === true
            ? html`<span
                class="status undefined"
                data-tip="No custom element is defined for this tag"
                >not defined</span
              >`
            : nothing
        }
        ${definedAsChip(node)} ${hydrationPill(node)}
        ${warnedChip(node.warnings)}
      </div>
      ${
        hasChildren && expanded
          ? children.map((c) => this._renderNode(c, depth + 1, filter))
          : nothing
      }
    `;
  }

  /**
   * One `name value` line; long values drop below the name. A `code` value
   * is a serialized JS preview and is coloured and re-flowed as one.
   */
  private _renderEntry(
    name: TemplateResult | string,
    value: string,
    opts: {
      trailing?: unknown;
      code?: boolean;
      key?: string;
      /** Where to expand the value from, when it has children to list. */
      expand?: {path: ValuePath; type: string};
      /** What the copy button puts on the clipboard; no button without it. */
      copy?: string;
      /** The value a "Store as global variable" button stores. */
      store?: ValuePath;
      /** The primitive the row can be set to, and the text to start from. */
      edit?: PropEdit;
      /** Extra classes on the row. */
      rowClass?: string;
      /** A line under the row, across every column (see `_docLine`). */
      below?: unknown;
    } = {}
  ): TemplateResult {
    const {
      trailing = nothing,
      code = false,
      key,
      expand,
      copy,
      store,
      edit,
      rowClass = '',
      below = nothing,
    } = opts;
    const expandable = expand !== undefined && !this._snapshot;
    const editing =
      edit !== undefined && key !== undefined && this._editing === key;
    const hooks = this._editHooks(key, edit);
    const open = expandable && this._expansion.isOpen(expand.path);
    return html`<div
      class="entry ${open || value.length > WIDE_VALUE ? 'wide' : ''} ${rowClass}"
      data-key=${key ?? nothing}
    >
      <span class="name">${name}</span>
      <span
        class="val ${code ? 'code' : ''} ${expandable ? 'has-caret' : ''}"
        @mousedown=${hooks.down}
        @dblclick=${hooks.dbl}
        >${(() => {
          if (editing) return this._renderEditInput(key, edit);
          const caret = expandable
            ? this._renderExpander(expand.path, name)
            : nothing;
          if (open) return html`${caret}${summarize(expand.type)}`;
          return code ? renderCode(value, caret) : html`${caret}${value}`;
        })()}${hooks.button}${trailing}${open ? this._renderLevel(expand.path) : nothing}</span
      >${store === undefined ? nothing : this._renderStore(store)}${
        copy === undefined || key === undefined
          ? nothing
          : this._renderCopy(key, copy)
      }${below}
    </div>`;
  }

  /**
   * What an editable value wears: the edit button after it, and a
   * double-click that does what the button does. All of it is absent for a
   * value that cannot be edited, or is being edited now.
   */
  private _editHooks(key: string | undefined, edit: PropEdit | undefined) {
    if (edit === undefined || key === undefined || this._editing === key)
      return {down: nothing, dbl: nothing, button: nothing};
    return {
      down: keepSelection,
      dbl: (e: Event) => {
        if ((e.target as Element).closest('button') !== null) return;
        if (edit.kind === 'boolean') this._setProp(edit, edit.text !== 'true');
        else void this._startEdit(key);
      },
      button: this._renderEditButton(key, edit),
    };
  }

  /**
   * A boolean flips on a click; a string or number turns its value into an
   * input. Either way the page answers with fresh details, so the row shows
   * what the page holds, not what was asked for.
   */
  private _renderEditButton(key: string, edit: PropEdit): TemplateResult {
    if (edit.kind === 'boolean') {
      const next = edit.text !== 'true';
      return html`<button
        class="edit"
        data-tip=${`Set to ${next} (or double-click the value)`}
        aria-label=${`Set to ${next}`}
        @click=${() => this._setProp(edit, next)}
      >
        <lit-icon name=${next ? 'toggle-right' : 'toggle-left'}></lit-icon>
      </button>`;
    }
    return html`<button
      class="edit"
      data-tip="Edit value (or double-click it)"
      aria-label="Edit value"
      @click=${() => void this._startEdit(key)}
    >
      <lit-icon name="pencil-simple"></lit-icon>
    </button>`;
  }

  private _renderEditInput(key: string, edit: PropEdit): TemplateResult {
    return html`<input
      class="edit-input"
      type=${edit.kind === 'number' ? 'number' : 'text'}
      step=${edit.kind === 'number' ? 'any' : nothing}
      .value=${edit.text}
      aria-label=${`Value of ${[edit.name, ...edit.keys].join('.')}`}
      aria-invalid=${this._editInvalid ? 'true' : 'false'}
      @input=${() => (this._editInvalid = false)}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._commitEdit(key, edit, e.currentTarget as HTMLInputElement);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          void this._endEdit(key, true);
        }
      }}
      @blur=${(e: FocusEvent) =>
        this._commitEdit(key, edit, e.currentTarget as HTMLInputElement, true)}
    />`;
  }

  private async _startEdit(key: string): Promise<void> {
    this._editInvalid = false;
    this._editing = key;
    await this.updateComplete;
    const input =
      this._rowOf(key)?.querySelector<HTMLInputElement>('.edit-input');
    input?.focus();
    input?.select();
  }

  private _rowOf(key: string): HTMLElement | null {
    for (const row of this.renderRoot.querySelectorAll<HTMLElement>(
      '.details .entry[data-key], .details .child[data-edit-key]'
    )) {
      if ((row.dataset['key'] ?? row.dataset['editKey']) === key) return row;
    }
    return null;
  }

  /** Leave edit mode; Escape hands focus back to the button that opened it. */
  private async _endEdit(key: string, refocus: boolean): Promise<void> {
    if (this._editing !== key) return;
    this._editing = null;
    this._editInvalid = false;
    if (!refocus) return;
    await this.updateComplete;
    this._rowOf(key)?.querySelector<HTMLElement>('button.edit')?.focus();
  }

  /**
   * Enter or blur. A number that is not one stays open and says so on Enter;
   * a blur drops it instead, since the focus has already left.
   */
  private _commitEdit(
    key: string,
    edit: PropEdit,
    input: HTMLInputElement,
    blurred = false
  ): void {
    if (this._editing !== key) return;
    const text = input.value;
    const value = edit.kind === 'number' ? Number(text.trim()) : text;
    if (
      edit.kind === 'number' &&
      (text.trim() === '' || !Number.isFinite(value as number))
    ) {
      if (blurred) void this._endEdit(key, false);
      else this._editInvalid = true;
      return;
    }
    void this._endEdit(key, !blurred);
    if (text !== edit.text) this._setProp(edit, value);
  }

  private _setProp(edit: PropEdit, value: string | number | boolean): void {
    const id = this._session.selectedId;
    if (id !== undefined && id !== null) {
      sendToPage({
        type: 'set-prop',
        id,
        name: edit.name,
        value,
        ...(edit.keys.length > 0 ? {keys: edit.keys} : {}),
      });
    }
  }

  /**
   * A button that copies a row's value as the pane shows it: the preview
   * string, not the live object, so a truncated value copies truncated.
   */
  private _renderCopy(key: string, text: string): TemplateResult {
    const copied = this._copied === key;
    return html`<button
      class="copy ${copied ? 'copied' : ''}"
      data-tip=${copied ? 'Copied' : 'Copy the value as shown'}
      aria-label=${copied ? 'Copied' : 'Copy value'}
      @click=${(e: Event) =>
        void this._copy(key, text, e.currentTarget as HTMLElement)}
    >
      <lit-icon name=${copied ? 'check' : 'copy'}></lit-icon>
    </button>`;
  }

  /**
   * A button that stores the live value behind a row in a `tempN` global on
   * the page, named in the page's console. None in a snapshot.
   */
  private _renderStore(path: ValuePath) {
    if (this._snapshot) return nothing;
    return html`<button
      class="store"
      data-tip="Store as global variable (named in the console)"
      aria-label="Store as global variable"
      @click=${() => {
        const id = this._session.details?.id;
        if (id !== undefined) sendToPage({type: 'store-global', id, path});
      }}
    >
      <lit-icon name="terminal"></lit-icon>
    </button>`;
  }

  private async _copy(
    key: string,
    text: string,
    button: HTMLElement
  ): Promise<void> {
    const ok = await copyText(text);
    // The fallback path selects a textarea outside this shadow root.
    button.focus();
    if (!ok) return;
    this._copied = key;
    clearTimeout(this._copiedTimer);
    this._copiedTimer = setTimeout(() => (this._copied = null), 1500);
  }

  private _renderExpander(
    path: ValuePath,
    label: TemplateResult | string
  ): TemplateResult {
    const open = this._expansion.isOpen(path);
    return html`<button
      class="expander"
      aria-expanded=${open ? 'true' : 'false'}
      aria-label=${`${open ? 'Collapse' : 'Expand'} ${
        typeof label === 'string' ? label : (path.keys.at(-1) ?? path.name)
      }`}
      @click=${() => this._expansion.toggle(path)}
    >
      <lit-icon name=${open ? 'caret-down' : 'caret-right'}></lit-icon>
    </button>`;
  }

  /** The children of an open value, each expandable in turn. */
  private _renderLevel(path: ValuePath): TemplateResult {
    const level = this._expansion.level(path);
    if (level === undefined || level.status === 'gone') {
      return html`<div class="children">
        <span class="muted"
          >${level === undefined ? '…' : 'no longer there'}</span
        >
      </div>`;
    }
    if (level.children === undefined) {
      return html`<div class="children"><span class="muted">…</span></div>`;
    }
    return html`<div class="children">
      ${level.children.map((c) => this._renderChild(path, c))}
      ${
        (level.more ?? 0) > 0
          ? html`<div class="child muted">+${level.more} more</div>`
          : nothing
      }
    </div>`;
  }

  private _renderChild(parent: ValuePath, c: ValueChild): TemplateResult {
    const path = {...parent, keys: [...parent.keys, c.key]};
    const open = c.expandable && this._expansion.isOpen(path);
    const {edit, editKey, target} = childWrites(path, c, this._snapshot);
    const editing = edit !== undefined && this._editing === editKey;
    const hooks = this._editHooks(editKey, edit);
    return html`<div class="child" data-edit-key=${editKey ?? nothing}>
      ${
        c.expandable
          ? this._renderExpander(path, c.label)
          : html`<span class="expander-space"></span>`
      }${target === undefined ? nothing : this._renderOverrideToggle(target)}<span
        class="t-key"
        >${c.entry ? renderCode(c.label) : c.label}</span
      ><span class="t-punct">${c.entry ? ' => ' : ': '}</span
      ><span class="t-value" @mousedown=${hooks.down} @dblclick=${hooks.dbl}
        >${
          editing
            ? this._renderEditInput(editKey!, edit)
            : open
              ? summarize(c.type)
              : renderCode(c.value)
        }${hooks.button}${
          target === undefined ? nothing : this._renderShadowed(target)
        }</span
      >${open ? this._renderLevel(path) : nothing}
    </div>`;
  }

  /**
   * A row name, with its manifest description as the tooltip when the
   * manifest documents a member of that name. With inline descriptions on,
   * the row's {@link _docLine} shows it instead.
   */
  private _describedName(
    name: string,
    documented: readonly DocEntry[],
    shown: TemplateResult | string = this._mark(name)
  ): TemplateResult {
    const tip = this._inlineDocs ? undefined : descriptionOf(name, documented);
    return html`<span
      class=${tip === undefined ? '' : 'described'}
      data-tip=${tip ?? nothing}
      >${shown}</span
    >`;
  }

  /**
   * The member's manifest description as a line under its row, when inline
   * descriptions are on and the manifest has one.
   */
  private _docLine(name: string, documented: readonly DocEntry[]) {
    const description = this._inlineDocs
      ? descriptionOf(name, documented)
      : undefined;
    return description === undefined
      ? nothing
      : html`<span class="doc-line">${description}</span>`;
  }

  /**
   * The manifest's docs for the selected element, narrowed by the row
   * filter. Empty when the host can't read manifests or none describes it.
   */
  private _docsView(d: InspectorDetails): DocsView {
    const docs =
      this._canReadDocs && d.notDefined !== true
        ? this._docs.for(d.tagName)
        : null;
    if (docs === null) return NO_DOCS;
    const byDoc = (e: DocEntry) =>
      this._matches(
        e.name,
        e.description === undefined ? '' : docPlainText(e.description),
        e.type ?? ''
      );
    const events = docs.events.filter(byDoc);
    const cssProperties = docs.cssProperties.filter(byDoc);
    const about = aboutText(docs);
    const examples = docs.examples ?? [];
    const aboutShown =
      (about !== undefined || examples.length > 0) &&
      this._matches(
        about === undefined ? '' : docPlainText(about),
        ...examples.map((e) => e.code)
      );
    return {
      docs,
      about,
      aboutShown,
      events,
      cssProperties,
      properties: docs.properties,
      attributes: docs.attributes,
      slots: docs.slots,
      cssParts: docs.cssParts,
      anyMatch: aboutShown || events.length + cssProperties.length > 0,
    };
  }

  /** Events and CSS properties: members only the manifest knows about. */
  private _renderDocSections(view: DocsView): TemplateResult {
    return html`${this._renderSection(
      'Events',
      view.events.length,
      view.docs?.events.length ?? 0,
      this._renderDocTable(view.events, 'event')
    )}${this._renderSection(
      'CSS properties',
      view.cssProperties.length,
      view.docs?.cssProperties.length ?? 0,
      this._renderDocTable(view.cssProperties, 'cssprop')
    )}`;
  }

  /** The source module the dev server read, or the manifest and its package. */
  private _originText(origin: DocsOrigin): string {
    if (origin.source === true) return `From ${origin.module}`;
    return `From ${origin.package ?? 'this project'}, ${origin.manifest}`;
  }

  /** The manifest's summary and description, and where they came from. */
  private _renderAbout(view: DocsView): TemplateResult | typeof nothing {
    const {docs, about} = view;
    const examples = docs?.examples ?? [];
    if (docs === null || (about === undefined && examples.length === 0))
      return nothing;
    const length = [
      docPlainText(about ?? ''),
      ...examples.map((e) => e.code),
    ].join('\n\n').length;
    const long = length > ABOUT_CLAMP_CHARS;
    const clamped = long && this._aboutOpenFor !== docs.tagName;
    return this._renderSection(
      'About',
      view.aboutShown ? 1 : 0,
      1,
      html`<div class="about">
        <div class=${clamped ? 'prose clamped' : 'prose'}>
          ${renderDocText(about ?? '', (t) => this._mark(t))}
          ${renderExamples(examples, (t) => this._mark(t))}
        </div>
        ${
          long
            ? html`<button
                class="more"
                @click=${() =>
                  (this._aboutOpenFor = clamped ? docs.tagName : null)}
              >
                ${clamped ? 'more' : 'less'}
              </button>`
            : nothing
        }
      </div>`,
      {
        count: false,
        aside: html`<button
          class="origin"
          type="button"
          data-tip=${this._originText(docs.origin)}
          aria-label=${this._originText(docs.origin)}
        >
          <lit-icon
            name=${docs.origin.source === true ? 'file-code' : 'package'}
          ></lit-icon>
        </button>`,
      }
    );
  }

  /**
   * Members only the manifest knows about: events the class fires, CSS
   * custom properties it reads. The name carries the declared type; the
   * value column holds the description and any default.
   */
  private _renderDocTable(entries: DocEntry[], kind: string): TemplateResult {
    return html`<div class="kv">
      ${entries.map(
        (e) =>
          html`<div class="entry wide" data-key=${`${kind}:${e.name}`}>
            <span class="name"
              >${this._mark(e.name)}${
                e.type === undefined
                  ? nothing
                  : html`<span class="type">${e.type}</span>`
              }${
                e.inheritedFrom === undefined
                  ? nothing
                  : html`<span class="type" data-tip="Inherited"
                      >${e.inheritedFrom}</span
                    >`
              }</span
            >
            <span class="val doc prose"
              >${e.description === undefined ? nothing : renderDocInline(e.description, (t) => this._mark(t))}${
                e.default === undefined
                  ? nothing
                  : html` <code class="default">${e.default}</code>`
              }</span
            >
          </div>`
      )}
    </div>`;
  }

  private _renderPropTable(
    props: InspectorDetails['properties'],
    documented: readonly DocEntry[]
  ): TemplateResult {
    return html`
      <div class="kv">
        ${byDeclaringClass(props).map(
          (group) =>
            html`${
              group.declaredBy === undefined
                ? nothing
                : html`<div
                    class="class-group"
                    data-tip=${
                      group.declaredBy.depth === 0
                        ? "Declared by the element's own class"
                        : `Inherited: declared ${group.declaredBy.depth === 1 ? 'one class' : `${group.declaredBy.depth} classes`} up`
                    }
                  >
                    ${group.declaredBy.name}
                  </div>`
            }${group.props.map((p) => this._renderPropEntry(p, documented))}`
        )}
      </div>
    `;
  }

  private _renderPropEntry(
    p: InspectorDetails['properties'][number],
    documented: readonly DocEntry[]
  ): TemplateResult {
    return this._renderEntry(
      html`${this._renderOverrideToggle({...p, keys: []})}${this._describedName(
        p.name,
        documented
      )}${typeLabel(p.type, p.value)}`,
      p.value,
      {
        rowClass: p.override === undefined ? '' : 'overridden',
        trailing: html`${this._renderPropBreak(p)}${this._renderShadowed({...p, keys: []})}${
          p.reflects
            ? html`<lit-badge
                class="badge"
                variant="neutral"
                data-tip="Reflects to an attribute"
                >${typeof p.attribute === 'string' ? p.attribute : 'attr'}</lit-badge
              >`
            : nothing
        }${propOptionBadges(p)}`,
        code: true,
        key: propKey(p.name),
        below: this._docLine(p.name, documented),
        copy: p.value,
        store: {section: 'prop', name: p.name, keys: []},
        edit: editOf(p, this._snapshot),
        ...(p.expandable === true
          ? {
              expand: {
                path: {section: 'prop', name: p.name, keys: []},
                type: p.type,
              },
            }
          : {}),
      }
    );
  }

  /**
   * An overridden value's own switch, like a declaration's checkbox in the
   * browser's Styles pane. A snapshot has no page to switch it in.
   */
  private _renderOverrideToggle(
    t: OverrideTarget
  ): TemplateResult | typeof nothing {
    const o = t.override;
    if (o === undefined || this._snapshot) return nothing;
    return html`<input
      type="checkbox"
      class="override-toggle"
      .checked=${o.enabled}
      aria-label=${`Override ${pathLabel(t.name, t.keys)}`}
      data-tip=${o.enabled ? 'Switch the override off' : 'Switch the override on'}
      @change=${(e: Event) =>
        this._session.toggleOverride(
          t.name,
          (e.target as HTMLInputElement).checked,
          t.keys
        )}
    />`;
  }

  /**
   * After an overridden value, the one it hides, struck through: the
   * intrinsic value while the override is in effect, else the override.
   * Then the button that drops the override.
   */
  private _renderShadowed(t: OverrideTarget): TemplateResult | typeof nothing {
    const o = t.override;
    if (o === undefined) return nothing;
    const inEffect = o.enabled && this._session.overrides.applied;
    return html`<span
        class="shadowed"
        data-tip=${inEffect ? 'Intrinsic value, overridden' : 'Override, off'}
        >${inEffect ? o.intrinsic : o.value}</span
      >${
        this._snapshot
          ? nothing
          : html`${this._renderPin(t.name, t.keys, o.persist === true)}<button
                class="remove-override"
                data-tip="Remove the override"
                aria-label=${`Remove the override on ${pathLabel(t.name, t.keys)}`}
                @click=${() => this._session.removeOverride(t.name, t.keys)}
              >
                <lit-icon name="x"></lit-icon>
              </button>`
      }`;
  }

  /**
   * Whether an override is kept across reloads, and the switch for it.
   * Absent where the page cannot keep anything (the extension).
   */
  private _renderPin(
    name: string,
    keys: readonly ValueSegment[],
    persist: boolean,
    id?: number
  ): TemplateResult | typeof nothing {
    if (this._session.overrides.canPersist !== true) return nothing;
    const label = pathLabel(name, keys);
    return html`<button
      class="pin-override ${persist ? 'pinned' : ''}"
      aria-pressed=${persist ? 'true' : 'false'}
      aria-label=${`Keep the override on ${label} across reloads`}
      data-tip=${persist ? 'Kept across reloads' : 'Keep across reloads'}
      @click=${() => this._session.persistOverride(name, !persist, keys, id)}
    >
      <lit-icon name="push-pin"></lit-icon>
    </button>`;
  }

  /**
   * The page's overrides at a glance, while there are any: a switch that
   * suspends them all, the list (each entry selects its element), and a way
   * to drop them all.
   */
  private _renderOverridesBar(): TemplateResult | typeof nothing {
    const {applied, entries, waiting = 0} = this._session.overrides;
    const dropped = this._session.droppedOverrides;
    const listed = entries.length + waiting;
    if (this._snapshot || listed + dropped.length === 0) return nothing;
    return html`<div class="overrides-bar">
      ${this._renderDropped(dropped)}${
        listed === 0
          ? nothing
          : this._renderOverridesList(applied, entries, waiting)
      }
    </div>`;
  }

  /**
   * Leaf overrides the page dropped because the app replaced the object
   * they were in. Stays until dismissed, so a drop is not missed.
   */
  private _renderDropped(
    dropped: readonly InspectorOverrideEntry[]
  ): TemplateResult | typeof nothing {
    if (dropped.length === 0) return nothing;
    const replaced = dropped.filter((e) => e.reason !== 'refused');
    const refused = dropped.filter((e) => e.reason === 'refused');
    return html`<div class="overrides-dropped" role="status">
      <lit-icon name="warning"></lit-icon>
      <span
        >${
          replaced.length === 0
            ? nothing
            : html`The app replaced the object under
              ${plural(replaced.length, 'an override', 'overrides')}, so
              ${replaced.length === 1 ? 'it was' : 'they were'} dropped:
              ${dropList(replaced)}. `
        }${
          refused.length === 0
            ? nothing
            : html`${plural(refused.length, 'A saved override', 'saved overrides')}
              no longer ${refused.length === 1 ? 'applies' : 'apply'}:
              ${dropList(refused)}.`
        }</span
      >
      <button
        class="remove-override"
        data-tip="Dismiss"
        aria-label="Dismiss"
        @click=${() => this._session.dismissDropped()}
      >
        <lit-icon name="x"></lit-icon>
      </button>
    </div>`;
  }

  private _renderOverridesList(
    applied: boolean,
    entries: readonly InspectorOverrideEntry[],
    waiting: number
  ): TemplateResult {
    return html` <lit-switch
        size="s"
        .checked=${applied}
        @change=${(e: Event) =>
          this._session.applyOverrides((e.target as LitSwitch).checked)}
        >Apply overrides</lit-switch
      >
      <details>
        <summary>
          ${plural(entries.length, '1 override', 'overrides')}${
            waiting === 0
              ? nothing
              : html`<span
                  class="waiting"
                  data-tip="Kept from an earlier load; they apply when their element appears"
                  >, ${waiting} saved, not on this page</span
                >`
          }
        </summary>
        <ul class="overrides-list">
          ${entries.map(
            (e) =>
              html`<li class=${e.enabled ? '' : 'off'}>
                <button
                  class="tag"
                  data-tip="Select the element"
                  @click=${() => this._session.select(e.id)}
                >
                  &lt;${e.tagName}&gt;${pathLabel('', [e.name, ...(e.keys ?? [])])}
                </button>
                <span class="override-value">${e.value}</span>
                ${this._renderPin(e.name, e.keys ?? [], e.persist === true, e.id)}
                <button
                  class="remove-override"
                  data-tip="Remove the override"
                  aria-label=${`Remove the override on ${e.tagName} ${pathLabel(e.name, e.keys ?? [])}`}
                  @click=${() =>
                    this._session.removeOverride(e.name, e.keys ?? [], e.id)}
                >
                  <lit-icon name="x"></lit-icon>
                </button>
              </li>`
          )}
        </ul>
      </details>
      <lit-button
        variant="neutral"
        class="clear-overrides"
        size="s"
        appearance="plain"
        @click=${() => this._session.clearOverrides()}
        >Clear all</lit-button
      >`;
  }

  /**
   * Instance state. The kind follows the name like a type tag (a field shows
   * its type instead, since "field" says nothing), then a task's status as
   * a coloured dot.
   */
  private _renderExtraTable(extras: InspectorExtra[]): TemplateResult {
    return html`
      <div class="kv">
        ${extras.map((e) =>
          this._renderEntry(
            html`${this._mark(e.name)}${
              e.kind === 'field'
                ? typeLabel(e.type, e.value)
                : html`<span class="type kind" data-tip=${e.type}
                    >${e.kind}</span
                  >`
            }${
              e.context === undefined
                ? nothing
                : html`<span class="type kind" data-tip=${e.context.role}
                    >${e.context.key}</span
                  >`
            }${
              e.status === undefined
                ? nothing
                : html`<span class="status task-${e.status}">${e.status}</span>`
            }`,
            e.value,
            {
              code: true,
              trailing:
                e.context === undefined
                  ? nothing
                  : this._renderContextLinks(e.context),
              key: extraKey(e.name),
              copy: e.value,
              store: {section: 'extra', name: e.name, keys: []},
              ...(e.expandable === true
                ? {
                    expand: {
                      path: {section: 'extra', name: e.name, keys: []},
                      // A task's or signal's type is the wrapper's; the
                      // children are its value's.
                      type:
                        e.kind === 'field' ? e.type : typeOfPreview(e.value),
                    },
                  }
                : {}),
            }
          )
        )}
      </div>
    `;
  }

  /**
   * Who is on the other side of a context: the provider a consumer reads
   * from, or the consumers subscribed to a provider.
   */
  private _renderContextLinks(c: InspectorContext): TemplateResult {
    const refs =
      c.role === 'consumer'
        ? c.provider === undefined
          ? []
          : [c.provider]
        : (c.consumers ?? []);
    const label = c.role === 'consumer' ? 'from' : 'to';
    if (refs.length === 0) {
      return html`<div class="ctx-links">
        <span class="muted"
          >${
            c.role === 'provider'
              ? 'no subscribers'
              : c.waiting
                ? 'waiting for a provider'
                : 'no provider found'
          }</span
        >
      </div>`;
    }
    return html`<div class="ctx-links">
      <span class="muted">${label}</span>
      ${refs.map((r) => this._renderElementRef(r))}
      ${
        c.moreConsumers === undefined
          ? nothing
          : html`<span class="muted">+${c.moreConsumers} more</span>`
      }
    </div>`;
  }

  /** An element in a slot or orphan row; inspectable ones select on click. */
  private _renderElementRef(ref: AnatomyElementRef): TemplateResult {
    const {id} = ref;
    return html`<button
      class="el-ref"
      ?disabled=${id === undefined}
      @click=${() => id !== undefined && this._session.select(id)}
      @mouseenter=${() => id !== undefined && this._highlight(id)}
      @mouseleave=${() => this._highlight(null)}
    >
      &lt;${ref.tagName}&gt;
    </button>`;
  }

  private _renderSlotBadge(label: string, tip: string): TemplateResult {
    return html`<lit-badge class="badge" variant="neutral" data-tip=${tip}
      >${label}</lit-badge
    >`;
  }

  /** The name cell of a slot row: its default/named label and its status badges. */
  private _renderSlotName(
    s: InspectorAnatomy['slots'][number],
    color: string,
    documented: readonly DocEntry[]
  ): TemplateResult {
    return html`<span class="name">
      <span class="swatch" style="background:${color}"></span
      >${this._describedName(
        s.name,
        documented,
        s.name === ''
          ? html`<span class="slot-default">${this._mark('default')}</span>`
          : this._mark(s.name)
      )}${
        s.status === 'assigned'
          ? nothing
          : this._renderSlotBadge(
              s.status,
              s.status === 'fallback'
                ? 'Nothing is assigned, so the slot shows its own content'
                : 'Nothing is assigned and the slot has no fallback content'
            )
      }${
        s.forwarded
          ? this._renderSlotBadge(
              'forwarded',
              'The content comes through a slot of an enclosing component'
            )
          : nothing
      }${
        s.duplicate
          ? this._renderSlotBadge(
              'duplicate',
              'An earlier slot has the same name, so this one never receives content'
            )
          : nothing
      }
    </span>`;
  }

  /** One slot row of the anatomy; hovering it focuses its region in the page. */
  private _renderSlotEntry(
    s: InspectorAnatomy['slots'][number],
    index: number,
    color: string,
    documented: readonly DocEntry[]
  ): TemplateResult {
    return html`<div
      class="entry region"
      @mouseenter=${() => this._focusRegion({kind: 'slot', index})}
      @mouseleave=${() => this._focusRegion(null)}
    >
      ${this._renderSlotName(s, color, documented)}
      <span class="val">
        ${s.elements.map((e) => this._renderElementRef(e))}${
          s.moreElements > 0
            ? html`<span class="muted">+${s.moreElements}</span>`
            : nothing
        }${
          s.textNodes > 0
            ? html`<span class="muted">${s.textNodes} text</span>`
            : nothing
        }
      </span>
      ${this._docLine(s.name, documented)}
    </div>`;
  }

  /**
   * Slots and parts, coloured like their regions in the page's anatomy
   * overlay: slot `i` takes colour `i`, and parts continue after the slots.
   */
  private _renderAnatomy(a: InspectorAnatomy, docs: DocsView): TemplateResult {
    const color = (i: number) => ANATOMY_COLORS[i % ANATOMY_COLORS.length];
    // Filtered rows render as `nothing` in place, so every row keeps the
    // index its colour and overlay region are keyed by.
    const m = anatomyMatches(a, (...t) => this._matches(...t));
    const slotsShown =
      m.slots.filter(Boolean).length +
      m.orphans.filter(Boolean).length +
      (m.orphanText ? 1 : 0);
    return html`
      ${this._renderSection(
        'Slots',
        slotsShown,
        a.slots.length + a.orphans.length + (a.orphanText > 0 ? 1 : 0),
        html`
          <div class="kv">
            ${a.slots.map((s, i) =>
              m.slots[i]
                ? this._renderSlotEntry(s, i, color(i), docs.slots)
                : nothing
            )}
            ${a.orphans.map((o, k) =>
              !m.orphans[k]
                ? nothing
                : html`<div
                    class="entry orphan"
                    data-tip="No slot takes this child, so it is not rendered"
                  >
                    <span class="name">
                      ${o.slot === '' ? 'no default slot' : `slot="${o.slot}"`}
                    </span>
                    <span class="val">
                      ${this._renderElementRef(o)}<span class="muted"
                        >not rendered</span
                      >
                    </span>
                  </div>`
            )}
            ${
              m.orphanText
                ? html`<div class="entry orphan">
                    <span class="name">no default slot</span>
                    <span class="val">${a.orphanText} text, not rendered</span>
                  </div>`
                : nothing
            }
          </div>
        `
      )}
      ${this._renderSection(
        'Parts',
        m.parts.filter(Boolean).length,
        a.parts.length,
        html`
          <div class="kv">
            ${a.parts.map((p, j) =>
              !m.parts[j]
                ? nothing
                : html`<div
                    class="entry region"
                    @mouseenter=${() => this._focusRegion({kind: 'part', index: j})}
                    @mouseleave=${() => this._focusRegion(null)}
                  >
                    <span class="name">
                      <span
                        class="swatch"
                        style="background:${color(a.slots.length + j)}"
                      ></span
                      >${this._describedName(
                        documentedPart(p.names, docs.cssParts),
                        docs.cssParts,
                        this._mark(p.names.join(' '))
                      )}${
                        p.forwarded
                          ? this._renderSlotBadge(
                              'forwarded',
                              p.forwarded.inner
                                ? `Forwarded by <${p.forwarded.from}> with exportparts, which renames "${p.forwarded.inner}"`
                                : `Forwarded by <${p.forwarded.from}> with exportparts`
                            )
                          : nothing
                      }
                    </span>
                    <span class="val code"
                      ><span class="t-punct">&lt;</span
                      ><span class="t-tag">${p.tagName}</span
                      ><span class="t-punct">&gt;</span></span
                    >${this._docLine(documentedPart(p.names, docs.cssParts), docs.cssParts)}
                  </div>`
            )}
          </div>
        `
      )}
    `;
  }

  /** {@link ElementActivity} of element `id` in the current buffer. */
  private _activityOf(id: number): ElementActivity {
    const events = getTimelineEvents();
    if (this._activity?.events !== events) {
      this._activity = {events, byId: elementActivity(events)};
    }
    return this._activity.byId.get(id) ?? NO_ACTIVITY;
  }

  /**
   * The Warnings section: Lit's dev-mode warnings, and how often the recording
   * shows the element re-rendering itself. Lit's dev build warns about that as
   * `change-in-update`, once per tag; the count joins that warning, and stands
   * alone only when Lit said nothing (a production build, or the warning
   * turned off). `shown` counts the rows the filter keeps.
   */
  private _warningsView(d: InspectorDetails): {
    shown: number;
    section: TemplateResult | typeof nothing;
  } {
    const all = d.warnings ?? [];
    const kept = all.filter((w) => this._matches(w.code, w.message));
    const rerenders = this._activityOf(d.id).selfCaused;
    const note =
      rerenders === 0
        ? ''
        : `Re-rendered itself ${rerenders === 1 ? 'once' : `${rerenders} times`} in the recording.`;
    const alone =
      rerenders > 0 && !all.some((w) => w.code === CHANGE_IN_UPDATE);
    const aloneText = `${note} Its own update scheduled another, so it rendered twice for one change. A property set in updated() does this; set it in willUpdate() instead.`;
    const aloneShown = alone && this._matches('re-rendered', aloneText);
    const shown = kept.length + (aloneShown ? 1 : 0);
    const section = this._renderSection(
      'Warnings',
      shown,
      all.length + (alone ? 1 : 0),
      html`<div class="kv">
        ${
          aloneShown
            ? html`<div class="warning self-caused">
                <span class="text">${this._mark(aloneText)}</span>
              </div>`
            : nothing
        }
        ${kept.map(
          (w) =>
            html`<div class="warning">
              ${
                w.code === ''
                  ? nothing
                  : html`<a
                      class="code"
                      href=${`https://lit.dev/msg/${w.code}`}
                      target="_blank"
                      rel="noreferrer"
                      >${w.code}</a
                    >`
              }
              <span class="text">${this._mark(w.message)}</span>
              ${
                w.code === CHANGE_IN_UPDATE && note !== ''
                  ? html`<span class="text self-caused"
                      >${this._mark(note)}</span
                    >`
                  : nothing
              }
            </div>`
        )}
      </div>`
    );
    return {shown, section};
  }

  /**
   * The Internals section: what the element keeps in its ElementInternals
   * (custom states, the form value, validity), for one that attached them.
   */
  private _internalsView(d: InspectorDetails): {
    shown: number;
    section: TemplateResult | typeof nothing;
  } {
    const all = d.internals === undefined ? [] : internalsRows(d.internals);
    const kept = all.filter((r) => this._matches(r.name, r.value));
    const section = this._renderSection(
      'Internals',
      kept.length,
      all.length,
      html`<div class="kv">
        ${kept.map((r) =>
          this._renderEntry(this._mark(r.name), r.value, {
            code: r.code,
            key: internalsKey(r.name),
            copy: r.value,
          })
        )}
      </div>`
    );
    return {shown: kept.length, section};
  }

  /**
   * The Dispatched section: how many events of each type the element
   * dispatched on itself in the recording. Counts only; which listeners ran
   * is not recorded.
   */
  private _dispatchedView(d: InspectorDetails): {
    shown: number;
    section: TemplateResult | typeof nothing;
  } {
    const all = this._activityOf(d.id).dispatched;
    const kept = all.filter((e) => this._matches(e.type, String(e.count)));
    const section = this._renderSection(
      'Dispatched',
      kept.length,
      all.length,
      html`<div class="kv dispatched">
        ${kept.map((e) =>
          this._renderEntry(e.type, `×${e.count}`, {
            key: `dispatched:${e.type}`,
          })
        )}
      </div>`
    );
    return {shown: kept.length, section};
  }

  /**
   * A details section that folds on its heading, with its row count beside
   * the label. Which sections are folded is remembered across selections and
   * reloads, keyed by label. While a filter is set, the count reads
   * `shown/total`, a section with no match is left out, and the rest show
   * open without touching the remembered folds.
   */
  private _renderSection(
    label: string,
    shown: number,
    total: number,
    body: TemplateResult,
    /**
     * `count: false` leaves the count out, for a section that is one block
     * rather than rows. `aside` sits at the heading's far end but outside
     * the `<summary>`, so it can take focus of its own without nesting a
     * control in the fold's toggle.
     */
    opts: {count?: boolean; aside?: TemplateResult} = {}
  ): TemplateResult | typeof nothing {
    const filtering = this._filtering;
    if (total === 0 || (filtering && shown === 0)) return nothing;
    const open = filtering || !this._collapsed.has(label);
    return html`<details
      class="section"
      data-section=${label}
      ?open=${open}
      @toggle=${(e: Event) => {
        // Opening for a filter is not the user's fold.
        if (this._filtering) return;
        this._setCollapsed(label, !(e.target as HTMLDetailsElement).open);
      }}
    >
      <summary>
        <lit-icon name=${open ? 'caret-down' : 'caret-right'}></lit-icon>
        <span class="label">${label}</span>
        ${
          opts.count === false
            ? nothing
            : html`<span class="count"
                >${filtering ? `${shown}/${total}` : total}</span
              >`
        }
      </summary>
      ${opts.aside ?? nothing} ${body}
    </details>`;
  }

  private get _filtering(): boolean {
    return this._query.trim() !== '';
  }

  /** Whether any of `texts` contains the filter; true with no filter. */
  private _matches(...texts: string[]): boolean {
    const q = this._query.trim().toLowerCase();
    return q === '' || texts.some((t) => t.toLowerCase().includes(q));
  }

  /** `text` with the first details filter match wrapped in `<mark>`. */
  private _mark(text: string): TemplateResult | string {
    return markMatch(text, this._query);
  }

  /**
   * Tree keyboard, as in the browser's Elements panel: Up/Down select the
   * neighbouring row, Right opens a closed node, Left closes an open one or
   * moves to its parent. Rows render as flat siblings, so neighbours and
   * parents are found by walking them. `expanded` is undefined for leaves and
   * while a filter holds every node open.
   */
  private _onRowKeydown(
    e: KeyboardEvent,
    id: number,
    expanded: boolean | undefined
  ): void {
    if (e.target !== e.currentTarget) return;
    const row = e.currentTarget as HTMLElement;
    const rows = [
      ...row.parentElement!.querySelectorAll<HTMLElement>(
        ':scope > [role="treeitem"]'
      ),
    ];
    const at = rows.indexOf(row);
    let target: HTMLElement | undefined;
    switch (e.key) {
      case 'Enter':
      case ' ':
        this._session.select(id);
        break;
      case 'ArrowDown':
        target = rows[at + 1];
        break;
      case 'ArrowUp':
        target = rows[at - 1];
        break;
      case 'ArrowRight':
        if (expanded === false) this._session.toggleExpand(id);
        else target = rows[at + 1];
        break;
      case 'ArrowLeft': {
        if (expanded === true) {
          this._session.toggleExpand(id);
          break;
        }
        const level = Number(row.getAttribute('aria-level'));
        target = rows
          .slice(0, at)
          .reverse()
          .find((r) => Number(r.getAttribute('aria-level')) < level);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    if (target === undefined) return;
    this._session.select(Number(target.dataset['id']));
    target.focus();
  }

  private _onTreeFilterInput(e: Event): void {
    this._treeQuery = (e.target as LitInput).value ?? '';
  }

  private _onTreeFilterKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || this._treeQuery === '') return;
    e.stopPropagation();
    this._treeQuery = '';
  }

  private _onFilterInput(e: Event): void {
    this._query = (e.target as LitInput).value ?? '';
  }

  private _onFilterKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || this._query === '') return;
    e.stopPropagation();
    this._query = '';
  }

  private _setCollapsed(label: string, collapsed: boolean): void {
    if (this._collapsed.has(label) === collapsed) return;
    const next = new Set(this._collapsed);
    if (collapsed) next.add(label);
    else next.delete(label);
    this._collapsed = next;
    try {
      localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify([...next]));
    } catch {
      // Storage unavailable: the fold just won't be remembered.
    }
  }

  /**
   * A `file:line` that opens in the editor, or in the host's own viewer when
   * it has one for the location (`source-opener.ts`); plain text where
   * neither can open it.
   */
  private _renderLocation(
    loc: ElementSource,
    cls: string,
    tip: string,
    open: () => void,
    module?: ManifestModule
  ): TemplateResult {
    const text = sourceText(loc.file, loc.line, module);
    const inHost = sourceOpenerFor(loc, this._canOpen) !== undefined;
    return this._canOpen || inHost
      ? html`<button
          class="link ${cls}"
          data-tip=${sourceTip(inHost ? sourceOpenerTip() : tip, loc.file, loc.line)}
          @click=${open}
        >
          ${text}<lit-icon name="arrow-square-out"></lit-icon>
        </button>`
      : html`<span
          class="${cls} src-text"
          data-tip=${ifDefined(fullSourceTip(loc.file, loc.line))}
          >${text}</span
        >`;
  }

  /** The buttons at the end of the details heading; none in a snapshot. */
  private _renderHeadActions(d: InspectorDetails) {
    if (this._snapshot) return nothing;
    const revealer = elementRevealer();
    return html`
      ${
        hasNoLitState(d)
          ? nothing
          : html`<lit-icon-button
              class="reveal"
              data-action="request-update"
              data-tip="Call requestUpdate() on this element"
              @click=${this._requestUpdate}
              icon="arrows-clockwise"
              label="Request update"
            ></lit-icon-button>`
      }
      <lit-icon-button
        class="reveal"
        data-tip="Scroll this element into view on the page"
        @click=${this._reveal}
        icon="target"
        label="Scroll into view"
      ></lit-icon-button>
      ${
        revealer === undefined || this.detailsOnly
          ? nothing
          : html`<lit-icon-button
              class="reveal"
              data-action="reveal-in-elements"
              data-tip="Reveal in the Elements panel"
              @click=${() => void revealer(d.id)}
              icon="cursor-click"
              label="Reveal in Elements"
            ></lit-icon-button>`
      }
    `;
  }

  private _renderDetails(): TemplateResult {
    const {details: d, gone, selectedId} = this._session;
    if (d === null) {
      let message: string;
      if (gone) {
        message = 'This element is no longer in the page.';
      } else if (selectedId === null) {
        message = this.detailsOnly
          ? 'Select an element inside a Lit component to inspect it.'
          : 'Select a component to inspect.';
      } else {
        message = 'Loading…';
      }
      return html`<div class="placeholder">${message}</div>`;
    }
    const byRow = (name: string, value: string) => this._matches(name, value);
    const allProps = d.properties.filter((p) => !p.state);
    const allState = d.properties.filter((p) => p.state);
    const allExtras = d.extras ?? [];
    const props = allProps.filter((p) => byRow(p.name, p.value));
    const stateProps = allState.filter((p) => byRow(p.name, p.value));
    const attributes = d.attributes.filter((a) => byRow(a.name, a.value));
    const extras = allExtras.filter((e) => byRow(e.name, e.value));
    const allWarnings = d.warnings ?? [];
    const warnings = this._warningsView(d);
    const dispatched = this._dispatchedView(d);
    const internals = this._internalsView(d);
    this._shownActivity = {id: d.id, activity: this._activityOf(d.id)};
    const docs = this._docsView(d);
    const anatomyHit =
      d.anatomy !== undefined &&
      Object.values(
        anatomyMatches(d.anatomy, (...t) => this._matches(...t))
      ).some((v) => (Array.isArray(v) ? v.includes(true) : v));
    const anyMatch =
      props.length +
        stateProps.length +
        attributes.length +
        extras.length +
        warnings.shown +
        dispatched.shown +
        internals.shown >
        0 ||
      anatomyHit ||
      docs.anyMatch;
    const rootLabel = describeRoot(d);
    return html`
      <div class="head">
        <h2>
          <span class="punct">&lt;</span>${d.tagName}<span class="punct"
            >&gt;</span
          >
        </h2>
        ${
          d.flags.isUpdatePending
            ? html`<span
                class="status pending"
                data-tip="An update is queued and has not run yet"
                >pending</span
              >`
            : nothing
        }
        ${
          allWarnings.length === 0
            ? nothing
            : html`<span
                class="status warned"
                data-tip="Lit warned about this component in dev mode; see Warnings below"
                >${allWarnings.length === 1 ? '1 warning' : `${allWarnings.length} warnings`}</span
              >`
        }
        ${
          d.notDefined === true
            ? html`<span
                class="status undefined"
                data-tip="No custom element is defined for this tag"
                >not defined</span
              >`
            : nothing
        }
        ${definedAsChip(d)} ${hydrationPill(d)} ${deprecatedChip(docs.docs)}
        ${
          d.flags.hasUpdated || hasNoLitState(d) || d.ssr !== undefined
            ? nothing
            : html`<span
                class="status"
                data-tip="The element has not finished its first update"
                >not rendered</span
              >`
        }
        ${this._renderHeadActions(d)}
      </div>
      <dl class="meta">
        ${
          d.source === undefined
            ? nothing
            : html`<dt>defined</dt>
                <dd>
                  ${this._renderLocation(
                    d.source,
                    'src',
                    'Open the class definition in your editor',
                    this._openSource,
                    manifestModuleOf(docs.docs)
                  )}
                </dd>`
        }
        ${
          d.callSite === undefined
            ? nothing
            : html`<dt>rendered</dt>
                <dd>
                  ${this._renderLocation(
                    d.callSite,
                    'src call-site',
                    'Open the template that renders this element',
                    this._openCallSite
                  )}
                </dd>`
        }
        ${
          rootLabel === undefined
            ? nothing
            : html`<dt>root</dt>
                <dd class="root">${rootLabel}</dd>`
        }
        ${this._renderBreakOn(d)}
      </dl>
      ${noStateNote(d)}
      <lit-input
        class="filter"
        size="s"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="Filter rows"
        label="Filter rows"
        with-clear
        .value=${this._query}
        @input=${this._onFilterInput}
        @wa-clear=${() => (this._query = '')}
        @keydown=${this._onFilterKeydown}
      >
        <lit-icon slot="start" name="magnifying-glass"></lit-icon>
        <lit-icon slot="clear-icon" name="x"></lit-icon>
      </lit-input>
      ${this._renderAbout(docs)} ${warnings.section}
      ${d.anatomy === undefined ? nothing : this._renderAnatomy(d.anatomy, docs)}
      ${this._renderSection(
        'Properties',
        props.length,
        allProps.length,
        this._renderPropTable(props, docs.properties)
      )}
      ${this._renderSection(
        'State',
        stateProps.length,
        allState.length,
        this._renderPropTable(stateProps, docs.properties)
      )}
      ${this._renderSection(
        'Attributes',
        attributes.length,
        d.attributes.length,
        html`
          <div class="kv">
            ${attributes.map((a) =>
              // Quoted, so it colours as the string it is.
              this._renderEntry(
                this._describedName(a.name, docs.attributes),
                JSON.stringify(a.value),
                {
                  code: true,
                  key: attrKey(a.name),
                  below: this._docLine(a.name, docs.attributes),
                  // The attribute's own text, without the quotes shown.
                  copy: a.value,
                }
              )
            )}
          </div>
        `
      )}
      ${internals.section} ${this._renderDocSections(docs)}
      ${dispatched.section}
      ${this._renderSection(
        'Instance',
        extras.length,
        allExtras.length,
        this._renderExtraTable(extras)
      )}
      ${
        this._filtering && !anyMatch
          ? html`<div class="no-match">
              No rows match “${this._query.trim()}”.
            </div>`
          : nothing
      }
    `;
  }

  /** One line for the latest patch that landed; hidden until there is one. */
  private _renderLastPatch(): TemplateResult | typeof nothing {
    const p = this._session.lastPatch;
    if (p === null) return nothing;
    return html`<div class="hmr-last-patch">
      Patched &lt;${p.tagName}&gt; ×${p.instances} in ${p.durationMs} ms
      (childState: ${p.childState})
      <span class="hmr-time">${formatRelativeTime(p.at)}</span>
    </div>`;
  }

  /**
   * Says which runtime serves the page when more than one loaded, the
   * extension's beside the dev server's: the first serves both panels and
   * the later one only shares its channel (`runtime-registry.ts`), so what
   * this tab shows comes from the first one's version. A snapshot has no
   * live page.
   */
  private _renderRuntimesBanner(): TemplateResult | typeof nothing {
    const runtimes = this._snapshot
      ? []
      : (this._session.runtime?.runtimes ?? []);
    if (runtimes.length < 2) return nothing;
    const [first, ...later] = runtimes.map((k) => PAGE_RUNTIME_NAMES[k]);
    return html`<div class="runtimes-banner" role="status">
      ${sentenceStart(first!)} serves this page; ${later.join(' and ')} shares
      its runtime.
    </div>`;
  }

  /**
   * Collapsible banner listing components that couldn't be hot-patched in
   * place, most recent first. Rendered only when there's at least one —
   * see `hmrIncompatibilityCount` for the tab-strip badge that covers the
   * case where the developer is parked on another tab.
   */
  private _renderHmrBanner(): TemplateResult | typeof nothing {
    if (this._session.hmrIncompatibilities.length === 0) return nothing;
    return html`
      <lit-details
        class="hmr-banner"
        appearance="plain"
        ?open=${this._hmrExpanded}
        @wa-show=${this._onHmrToggle}
        @wa-hide=${this._onHmrToggle}
      >
        <span slot="summary">
          <span class="hmr-title">HMR issues</span>
          <lit-badge appearance="accent" class="hmr-count" variant="danger" pill
            >${this._session.hmrIncompatibilities.length}</lit-badge
          >
        </span>
        <lit-icon slot="expand-icon" name="caret-right"></lit-icon>
        <lit-icon slot="collapse-icon" name="caret-down"></lit-icon>
        ${
          this._hmrExpanded
            ? html`
                <ul class="hmr-list">
                  ${[...this._session.hmrIncompatibilities].reverse().map(
                    (e) => html`
                      <li class="hmr-item">
                        <span class="tag"
                          ><span class="punct">&lt;</span>${e.tagName}<span
                            class="punct"
                            >&gt;</span
                          ></span
                        >
                        <span class="hmr-reason"
                          >${describeHmrReason(e.reason)}</span
                        >
                        ${
                          e.action !== 'none'
                            ? html`<span class="hmr-outcome"
                                >${
                                  e.action === 'reload'
                                    ? 'reloaded'
                                    : 'warned only'
                                }</span
                              >`
                            : nothing
                        }
                        <span class="hmr-time"
                          >${formatRelativeTime(e.time)}</span
                        >
                      </li>
                    `
                  )}
                </ul>
              `
            : nothing
        }
      </lit-details>
    `;
  }

  private _renderToggle(
    kind: string,
    on: boolean,
    tip: string,
    onClick: () => void,
    icon: TemplateResult,
    label: string
  ): TemplateResult {
    return html`<lit-button
      class="${kind} ${on ? 'active' : ''}"
      size="s"
      variant=${on ? 'brand' : 'neutral'}
      appearance=${on ? 'filled' : 'outlined'}
      data-tip=${tip}
      @click=${onClick}
    >
      ${icon} ${label}
    </lit-button>`;
  }

  override render() {
    if (this.detailsOnly) {
      return html`${this._renderOverridesBar()}
        <div class="details">${this._renderDetails()}</div>`;
    }
    const treeFilter =
      this._treeQuery.trim() === ''
        ? undefined
        : filterTree(this._session.roots, this._treeQuery);
    return html`
      <div class="toolbar">
        ${
          this._canPick
            ? this._renderToggle(
                'pick',
                this._session.picking,
                'Pick an element on the page (Meta+Shift+E)',
                this._togglePick,
                html`<lit-icon slot="start" name="crosshair"></lit-icon>`,
                'Pick'
              )
            : nothing
        }
        <lit-input
          class="tree-filter"
          size="s"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder="Filter tags"
          label="Filter tags"
          with-clear
          .value=${this._treeQuery}
          @input=${this._onTreeFilterInput}
          @wa-clear=${() => (this._treeQuery = '')}
          @keydown=${this._onTreeFilterKeydown}
        >
          <lit-icon slot="start" name="magnifying-glass"></lit-icon>
          ${
            treeFilter === undefined
              ? nothing
              : html`<span
                  slot="end"
                  class="match-count"
                  data-tip="Elements that match"
                  >${treeFilter.matched.size}</span
                >`
          }
          <lit-icon slot="clear-icon" name="x"></lit-icon>
        </lit-input>
        <span class="spacer"></span>
        ${this._renderToggle(
          'live',
          this._session.live,
          this._session.live
            ? 'Pause: stop updating the tree as the page changes'
            : 'Resume updating the tree as the page changes',
          this._toggleLive,
          html`<lit-icon
            slot="start"
            name=${this._session.live ? 'eye' : 'eye-slash'}
          ></lit-icon>`,
          'Live'
        )}
        ${this._renderToggle(
          'flash',
          this._flash,
          'Flash elements on the page when they update',
          this._toggleFlash,
          html`<lit-icon slot="start" name="lightning"></lit-icon>`,
          'Flash'
        )}
        ${
          this._snapshot
            ? nothing
            : this._renderToggle(
                'anatomy',
                this._anatomy,
                "Draw the selected element's slots and parts on the page",
                this._toggleAnatomy,
                html`<lit-icon slot="start" name="bounding-box"></lit-icon>`,
                'Anatomy'
              )
        }
      </div>
      ${this._renderRuntimesBanner()}${this._renderHmrBanner()}${this._renderLastPatch()}${this._renderOverridesBar()}
      <lit-split-panel
        primary="end"
        position-in-pixels=${this._detailsWidth}
        @wa-reposition=${this._saveDetailsWidth}
      >
        <div
          slot="start"
          class="tree"
          role="tree"
          aria-label="Components"
          @mouseleave=${this._leaveTree}
        >
          ${
            this._error !== null
              ? html`<div class="empty">${this._error}</div>`
              : this._session.roots.length === 0
                ? this._renderEmpty()
                : treeFilter !== undefined && treeFilter.keep.size === 0
                  ? html`<div class="empty no-match">
                      No elements match “${this._treeQuery.trim()}”.
                    </div>`
                  : this._session.roots.map((n) =>
                      this._renderNode(n, 0, treeFilter)
                    )
          }
        </div>
        <div slot="end" class="details">${this._renderDetails()}</div>
      </lit-split-panel>
    `;
  }
}

/**
 * Coarse relative time for an {@link HmrIncompatibilityEvent}'s `Date.now()`
 * timestamp (there is no live clock tick in this view — good enough for a
 * banner of rare, one-off events, unlike the timeline's precise `ms` display).
 */
const formatRelativeTime = (time: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};

declare global {
  interface HTMLElementTagNameMap {
    'components-view': ComponentsView;
  }
}
