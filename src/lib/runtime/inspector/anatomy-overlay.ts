/**
 * Draws one element's anatomy on the page: an outline round the host, a
 * filled box per slot, and a dashed box per `::part` export. Colours come
 * from {@link ANATOMY_COLORS}, in the same order the details pane lists the
 * slots and parts, so a row and its region match.
 *
 * A `<slot>` is `display: contents` and has no box of its own. Each region
 * is the bounding box of what the slot renders: its assigned nodes, or its
 * fallback content. A slot that renders nothing gets no region; the pane
 * says it is empty.
 *
 * Regions are named by callouts rather than by labels on their boxes, which
 * crowd on a small element with many regions. The labels stand in gutters
 * beside the host and a leader line runs from each to its region, ending in
 * a dot on the box's edge. Regions with the same label (twelve clock ticks)
 * share one label with a leader each. The host's own label stays above it.
 * {@link ./anatomy-layout.ts} decides where everything goes; this module
 * measures, asks it, and draws.
 *
 * Everything is `position: fixed` and redrawn every frame while shown, so it
 * follows scrolling, resizing and slot changes without observers. Each frame
 * reads every box before it writes anything, and reuses its elements.
 *
 * Hovering a slot or part row in the pane focuses its region: it gains a
 * ring and a stronger fill, its leader thickens, and the others fade, so a
 * row can be found on a busy page. With the overlay off, a hovered row draws
 * just its own region, label and leader, in that focused style.
 */

import {elementById} from '../timeline/identity.js';
import {partsOf, renderedNodesOf, slotsOf} from './anatomy.js';
import {ANATOMY_COLORS, type AnatomyFocus} from '../../../types/inspector.js';
import {
  type Box,
  type Group,
  type Placement,
  type Region,
  groupLabel,
  groupRegions,
  layoutLabels,
  leaderTo,
} from './anatomy-layout.js';

let parts: Parts | null = null;
let frame = 0;
let target: WeakRef<Element> | null = null;
/** The focused region's key (`slot:0`, `part:1`), or `null` for none. */
let focusKey: string | null = null;

/** How far the unfocused regions fade while one is focused. */
const FADED_OPACITY = '0.25';

interface Pool<T extends HTMLElement | SVGElement> {
  /** The next element to draw with, shown; added when the pool runs out. */
  take(): T;
  /** Hides what this frame didn't take, ready for the next. */
  rest(): void;
}

const pool = <T extends HTMLElement | SVGElement>(
  parent: Element,
  make: () => T
): Pool<T> => {
  const items: T[] = [];
  let used = 0;
  return {
    take() {
      let el = items[used];
      if (el === undefined) {
        el = make();
        parent.append(el);
        items.push(el);
      }
      used++;
      el.style.display = '';
      return el;
    },
    rest() {
      for (let j = used; j < items.length; j++) items[j].style.display = 'none';
      used = 0;
    },
  };
};

/** The layer and what it holds, made once and reused across draws. */
interface Parts {
  layer: HTMLElement;
  boxes: Pool<HTMLElement>;
  labels: Pool<HTMLElement>;
  leaders: Pool<SVGGElement>;
  /** Hidden, to read how wide a label's text runs. */
  ruler: HTMLElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const makeLeader = (): SVGGElement => {
  const g = document.createElementNS(SVG_NS, 'g');
  g.append(
    document.createElementNS(SVG_NS, 'path'),
    document.createElementNS(SVG_NS, 'circle')
  );
  g.querySelector('path')!.setAttribute('fill', 'none');
  g.querySelector('path')!.setAttribute('stroke-linejoin', 'round');
  g.querySelector('circle')!.setAttribute('r', '2.5');
  return g;
};

/** A div marked as a `box` or a `label`, which is how tests tell them apart. */
const tagged = (what: 'box' | 'label'): HTMLElement => {
  const el = document.createElement('div');
  el.setAttribute(`data-anatomy-${what}`, '');
  return el;
};

const makeParts = (): Parts => {
  const layer = document.createElement('div');
  layer.setAttribute('data-lit-devtools-anatomy', '');
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483645',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  // Leaders go over the boxes and under the labels.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    overflow: 'visible',
    zIndex: '1',
  } satisfies Partial<CSSStyleDeclaration>);
  layer.append(svg);
  const ruler = document.createElement('span');
  styleLabelFont(ruler);
  Object.assign(ruler.style, {
    position: 'fixed',
    visibility: 'hidden',
    padding: `0 ${LABEL_PADDING}px`,
  } satisfies Partial<CSSStyleDeclaration>);
  layer.append(ruler);
  return {
    layer,
    boxes: pool(layer, () => tagged('box')),
    labels: pool(layer, () => tagged('label')),
    leaders: pool(svg, makeLeader),
    ruler,
  };
};

const ensureLayer = (): Parts => {
  parts ??= makeParts();
  if (!parts.layer.isConnected) document.body.append(parts.layer);
  return parts;
};

/** `DOMRect` is a `Box` too. */
const union = (a: Box | null, r: Box): Box | null => {
  if (r.right === r.left && r.bottom === r.top) return a;
  if (a === null) {
    return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
  }
  return {
    left: Math.min(a.left, r.left),
    top: Math.min(a.top, r.top),
    right: Math.max(a.right, r.right),
    bottom: Math.max(a.bottom, r.bottom),
  };
};

/** `box` grown by what `el` paints, falling back to its children. */
const elementBounds = (el: Element, box: Box | null): Box | null => {
  const rects = el.getClientRects();
  // `display: contents` has no rects; its children paint instead.
  if (rects.length === 0) {
    const inner = boundsOf(el.childNodes);
    if (inner !== null) box = union(box, inner);
  }
  for (const r of rects) box = union(box, r);
  return box;
};

/** `box` grown by what the text node `text` paints. */
const textBounds = (text: Node, box: Box | null): Box | null => {
  const range = document.createRange();
  range.selectNodeContents(text);
  for (const r of range.getClientRects()) box = union(box, r);
  return box;
};

/** The bounding box of what `nodes` paint, or `null` when they paint nothing. */
const boundsOf = (nodes: Iterable<Node>): Box | null => {
  let box: Box | null = null;
  for (const n of nodes) {
    if (n instanceof Element) box = elementBounds(n, box);
    else if (n.nodeType === Node.TEXT_NODE) box = textBounds(n, box);
  }
  return box;
};

const toRect = (b: Box) => ({
  x: b.left,
  y: b.top,
  width: b.right - b.left,
  height: b.bottom - b.top,
});

const LABEL_HEIGHT = 16;
const LABEL_PADDING = 4;
const LABEL_FONT =
  '500 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace';

type Kind = 'host' | 'slot' | 'part';

const kindOf = (key: string): Kind =>
  key.startsWith('slot:') ? 'slot' : 'part';

/** The opacity of something that is, or isn't, the focus's. */
const fadeOf = (focused: boolean): string =>
  focusKey === null || focused ? '1' : FADED_OPACITY;

const FADE_TRANSITION = 'opacity 150ms ease-out';

/** Positions, borders and fades the box element `el` for one part. */
const styleBox = (
  el: HTMLElement,
  {x, y, width, height}: ReturnType<typeof toRect>,
  color: string,
  kind: Kind,
  focused: boolean
): void => {
  Object.assign(el.style, {
    display: 'block',
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    boxSizing: 'border-box',
    border: `${kind === 'slot' ? 2 : 1}px ${kind === 'slot' ? 'solid' : 'dashed'} ${color}`,
    background: focused
      ? `${color}33`
      : kind === 'slot'
        ? `${color}1f`
        : 'transparent',
    borderRadius: '2px',
    boxShadow: focused ? `0 0 0 3px ${color}59` : 'none',
    opacity: fadeOf(focused),
    transition: `${FADE_TRANSITION}, box-shadow 150ms ease-out, background 150ms ease-out`,
  } satisfies Partial<CSSStyleDeclaration>);
};

const styleLabelFont = (el: HTMLElement): void => {
  Object.assign(el.style, {
    font: LABEL_FONT,
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
};

/** Styles and places the label element `el`; the host's is outlined, not filled. */
const styleLabel = (
  el: HTMLElement,
  text: string,
  color: string,
  kind: Kind,
  at: Pick<Placement, 'left' | 'top' | 'width'>,
  focused: boolean
): void => {
  el.textContent = text;
  styleLabelFont(el);
  Object.assign(el.style, {
    display: 'block',
    position: 'fixed',
    zIndex: '2',
    left: `${at.left}px`,
    top: `${at.top}px`,
    width: `${at.width}px`,
    height: `${LABEL_HEIGHT}px`,
    boxSizing: 'border-box',
    padding: `0 ${LABEL_PADDING}px`,
    color: kind === 'host' ? color : '#fff',
    background: kind === 'host' ? 'rgba(255, 255, 255, 0.9)' : color,
    borderRadius: '2px',
    opacity: fadeOf(focused),
    transition: FADE_TRANSITION,
  } satisfies Partial<CSSStyleDeclaration>);
};

/** Label widths by text; the font never changes, so the text is the key. */
const widths = new Map<string, number>();

const widthOf = (ruler: HTMLElement, text: string): number => {
  let w = widths.get(text);
  if (w === undefined) {
    ruler.textContent = text;
    w = Math.ceil(ruler.getBoundingClientRect().width);
    if (widths.size > 200) widths.clear();
    widths.set(text, w);
  }
  return w;
};

/** Draws one leader: a path from its label to `box`, ending in a dot. */
const styleLeader = (
  g: SVGGElement,
  region: Region,
  color: string,
  place: Placement,
  fan: boolean
): void => {
  const {d, end} = leaderTo(place, region.box, fan);
  const focused = region.key === focusKey;
  const path = g.firstElementChild!;
  const dot = g.lastElementChild!;
  path.setAttribute('d', d);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', focused ? '2' : '1.25');
  path.setAttribute('stroke-opacity', focused ? '1' : '0.75');
  dot.setAttribute('cx', `${end.x}`);
  dot.setAttribute('cy', `${end.y}`);
  dot.setAttribute('fill', color);
  dot.setAttribute('fill-opacity', focused ? '1' : '0.85');
  g.style.opacity = fadeOf(focused);
  g.style.transition = FADE_TRANSITION;
};

/** The host's label: above it, or inside it when it touches the viewport's top. */
const hostPlacement = (host: Box, width: number): Placement => ({
  left: host.left - 1,
  top: host.top < LABEL_HEIGHT ? host.top : host.top - LABEL_HEIGHT,
  width,
  height: LABEL_HEIGHT,
  side: 'above',
});

const HOST_COLOR = '#868e96';

/** Draws the host's outline and label. */
const drawHost = (ui: Parts, host: Box, name: string, width: number): void => {
  styleBox(ui.boxes.take(), toRect(host), HOST_COLOR, 'host', false);
  const at = hostPlacement(host, width);
  styleLabel(ui.labels.take(), name, HOST_COLOR, 'host', at, false);
};

/** Draws each region's box, then each group's label and its leaders. */
const drawCallouts = (
  ui: Parts,
  groups: Group[],
  places: Placement[]
): void => {
  groups.forEach((g, i) => {
    const focused = g.regions.some((r) => r.key === focusKey);
    for (const r of g.regions) {
      const isFocus = r.key === focusKey;
      styleBox(ui.boxes.take(), toRect(r.box), r.color, kindOf(r.key), isFocus);
      styleLeader(
        ui.leaders.take(),
        r,
        g.color,
        places[i],
        g.regions.length > 1
      );
    }
    styleLabel(
      ui.labels.take(),
      groupLabel(g),
      g.color,
      'part',
      places[i],
      focused
    );
  });
};

const slotLabel = (slot: HTMLSlotElement): string => {
  const name = slot.name === '' ? 'default slot' : `slot "${slot.name}"`;
  return slot.assignedNodes().length === 0 ? `${name} · fallback` : name;
};

const regionKey = (focus: AnatomyFocus): string =>
  `${focus.kind}:${focus.index}`;

/** The slots' then the parts' regions that paint something and pass `keep`. */
const regionsOf = (el: Element, keep: (key: string) => boolean): Region[] => {
  const out: Region[] = [];
  const slots = slotsOf(el);
  slots.forEach((slot, i) => {
    const key = `slot:${i}`;
    const box = keep(key) ? boundsOf(renderedNodesOf(slot)) : null;
    const color = ANATOMY_COLORS[i % ANATOMY_COLORS.length];
    if (box !== null) out.push({key, text: slotLabel(slot), color, box});
  });
  partsOf(el).forEach(({names, element}, j) => {
    const key = `part:${j}`;
    const box = keep(key) ? boundsOf([element]) : null;
    const color = ANATOMY_COLORS[(slots.length + j) % ANATOMY_COLORS.length];
    const text = `::part(${names.join(' ')})`;
    if (box !== null) out.push({key, text, color, box});
  });
  return out;
};

/** The host's box, or what its regions span when it paints nothing itself. */
const hostBounds = (el: Element, regions: Region[]): Box | null =>
  boundsOf([el]) ?? regions.reduce<Box | null>((a, r) => union(a, r.box), null);

/** Draws `el`'s anatomy, or only the regions whose key `keep` accepts. */
const render = (el: Element, keep: (key: string) => boolean): void => {
  const ui = ensureLayer();
  // Read every box before anything is written.
  const regions = regionsOf(el, keep);
  const host = hostBounds(el, regions);
  const groups = groupRegions(regions);
  const name = `<${el.localName}>`;
  const nameWidth = widthOf(ui.ruler, name);
  const labelWidths = groups.map((g) => widthOf(ui.ruler, groupLabel(g)));
  if (host !== null) {
    const view = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    const places = layoutLabels(groups, labelWidths, LABEL_HEIGHT, host, view);
    if (keep('host')) drawHost(ui, host, name, nameWidth);
    drawCallouts(ui, groups, places);
  }
  ui.boxes.rest();
  ui.labels.rest();
  ui.leaders.rest();
};

/** Hide the anatomy. Cheap and safe before it has ever been drawn. */
export const clearAnatomy = (): void => {
  cancelAnimationFrame(frame);
  target = null;
  focusKey = null;
  parts?.layer.remove();
};

/**
 * Draw the anatomy of the element with this id until it is cleared, the
 * element leaves the page, or another id replaces it. `null` and unknown ids
 * clear it. With `only`, draw just that region, focused, and no host box or
 * other regions.
 */
export const anatomyById = (id: number | null, only?: AnatomyFocus): void => {
  clearAnatomy();
  const el = id === null ? undefined : elementById(id);
  if (el === undefined) return;
  const ref = new WeakRef(el);
  target = ref;
  const onlyKey = only === undefined ? null : regionKey(only);
  focusKey = onlyKey;
  const keep = (key: string): boolean => onlyKey === null || key === onlyKey;
  const tick = (): void => {
    const cur = ref.deref();
    if (target !== ref || cur === undefined || !cur.isConnected) {
      if (target === ref) clearAnatomy();
      return;
    }
    render(cur, keep);
    frame = requestAnimationFrame(tick);
  };
  tick();
};

/**
 * Emphasise one slot or part region and fade the others, or show them all
 * evenly again for `null`. Takes effect on the next frame; does nothing
 * while no anatomy is drawn.
 */
export const focusAnatomy = (focus: AnatomyFocus | null): void => {
  focusKey = focus === null ? null : regionKey(focus);
};
