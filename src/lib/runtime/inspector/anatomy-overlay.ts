/**
 * Draws one element's anatomy on the page: an outline round the host, a
 * labelled region per slot, and a dashed box per `::part` export. Colours
 * come from {@link ANATOMY_COLORS}, in the same order the details pane lists
 * the slots and parts, so a row and its region match.
 *
 * A `<slot>` is `display: contents` and has no box of its own. Each region
 * is the bounding box of what the slot renders: its assigned nodes, or its
 * fallback content. A slot that renders nothing gets no region; the pane
 * says it is empty.
 *
 * The boxes are `position: fixed` and redrawn every frame while shown, so
 * they follow scrolling, resizing and slot changes without observers.
 *
 * Hovering a slot or part row in the pane focuses its region: it gains a
 * ring and a stronger fill, and the others fade, so a row can be found on a busy page.
 * With the overlay off, a hovered row draws just its own region, in that focused
 * style, and nothing else.
 */

import {elementById} from '../timeline/identity.js';
import {partsOf, renderedNodesOf, slotsOf} from './anatomy.js';
import {ANATOMY_COLORS, type AnatomyFocus} from '../../../types/inspector.js';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let layer: HTMLElement | null = null;
let frame = 0;
let target: WeakRef<Element> | null = null;
/** The focused region's key (`slot:0`, `part:1`), or `null` for none. */
let focusKey: string | null = null;

/** How far the unfocused regions fade while one is focused. */
const FADED_OPACITY = '0.25';

const ensureLayer = (): HTMLElement => {
  if (layer === null) {
    layer = document.createElement('div');
    layer.setAttribute('data-lit-devtools-anatomy', '');
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483645',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
  }
  if (!layer.isConnected) document.body.append(layer);
  return layer;
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

/** Positions, borders and fades the box element `el` for one part. */
const styleBox = (
  el: HTMLElement,
  {x, y, width, height}: ReturnType<typeof toRect>,
  color: string,
  style: 'host' | 'slot' | 'part',
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
    border: `${style === 'slot' ? 2 : 1}px ${style === 'slot' ? 'solid' : 'dashed'} ${color}`,
    background: focused
      ? `${color}33`
      : style === 'slot'
        ? `${color}1f`
        : 'transparent',
    borderRadius: '2px',
    boxShadow: focused ? `0 0 0 3px ${color}59` : 'none',
    opacity: focusKey === null || focused ? '1' : FADED_OPACITY,
    transition:
      'opacity 150ms ease-out, box-shadow 150ms ease-out, background 150ms ease-out',
  } satisfies Partial<CSSStyleDeclaration>);
};

/** Styles the label `tag`, above its box or inside it when `inside`. */
const styleTag = (
  tag: HTMLElement,
  color: string,
  style: 'host' | 'slot' | 'part',
  inside: boolean
): void => {
  Object.assign(tag.style, {
    position: 'absolute',
    left: '-1px',
    [inside ? 'top' : 'bottom']: inside ? '0' : '100%',
    [inside ? 'bottom' : 'top']: 'auto',
    height: `${LABEL_HEIGHT}px`,
    padding: '0 4px',
    font: '500 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'nowrap',
    color: style === 'host' ? color : '#fff',
    background: style === 'host' ? 'rgba(255, 255, 255, 0.9)' : color,
    borderRadius: '2px',
    transform: '',
  } satisfies Partial<CSSStyleDeclaration>);
};

const LABEL_STEP = LABEL_HEIGHT + 2;
/** Labels a stack may hold before the next one goes sideways instead. */
const MAX_STACK = 4;

const hitIn = (r: DOMRect, placed: DOMRect[]): DOMRect | undefined =>
  placed.find(
    (p) =>
      r.left < p.right &&
      p.left < r.right &&
      r.top < p.bottom &&
      p.top < r.bottom
  );

/**
 * Where a label may go, as offsets from its usual spot, best first: there,
 * then just inside the top of its own box, then stacked further out. A
 * label already drawn inside (its box touches the viewport's top) only
 * stacks further in.
 */
const offsetsFor = (inside: boolean): number[] => {
  // Past the box's border too, which is up to 2px.
  const out = inside ? [0] : [0, LABEL_HEIGHT + 2];
  for (let k = 1; k <= MAX_STACK; k++) {
    out.push(inside ? k * LABEL_STEP : -k * LABEL_STEP);
  }
  return out;
};

/**
 * The first spot on the row `dy` from `base` that clears `placed`: there,
 * or past the labels in the way, as long as it ends inside `maxRight`, the
 * right edge of the label's own box.
 */
const fitRow = (
  base: DOMRect,
  dy: number,
  placed: DOMRect[],
  maxRight: number
): DOMRect | undefined => {
  let r = new DOMRect(base.x, base.y + dy, base.width, base.height);
  for (let tries = 0; tries < 8; tries++) {
    const hit = hitIn(r, placed);
    if (hit === undefined) return r;
    r = new DOMRect(hit.right + 2, r.y, r.width, r.height);
    if (r.right > maxRight) return undefined;
  }
  return undefined;
};

/**
 * Moves `tag` to the first row in {@link offsetsFor} with room for it over
 * its own box, `box`, so a label stays on the region it names. Undefined
 * when none has, or the next row would leave the viewport.
 */
const stackTag = (
  tag: HTMLElement,
  placed: DOMRect[],
  box: DOMRect,
  inside: boolean
): DOMRect | undefined => {
  const base = tag.getBoundingClientRect();
  for (const dy of offsetsFor(inside)) {
    if (base.top + dy < 0 || base.bottom + dy > innerHeight) return undefined;
    const r = fitRow(base, dy, placed, box.right);
    if (r === undefined) continue;
    const dx = r.x - base.x;
    tag.style.transform =
      dx === 0 && dy === 0 ? '' : `translate(${dx}px, ${dy}px)`;
    return r;
  }
  return undefined;
};

/** Shifts `tag` right until its label clears every one in `placed`. */
const shiftTag = (tag: HTMLElement, placed: DOMRect[]): DOMRect => {
  let shift = 0;
  tag.style.transform = '';
  let r = tag.getBoundingClientRect();
  for (let tries = 0; tries < 8; tries++) {
    const hit = hitIn(r, placed);
    if (hit === undefined) break;
    shift += hit.right - r.left + 2;
    tag.style.transform = `translateX(${shift}px)`;
    r = tag.getBoundingClientRect();
  }
  return r;
};

const placeTag = (
  tag: HTMLElement,
  placed: DOMRect[],
  box: DOMRect,
  inside: boolean
): DOMRect => stackTag(tag, placed, box, inside) ?? shiftTag(tag, placed);

/** Reuses the layer's children in order, adding one when it runs out. */
const drawer = (root: HTMLElement) => {
  let i = 0;
  // Labels already placed this frame. A part often wraps a slot exactly, so
  // their labels would land on the same spot; later ones move aside.
  const placed: DOMRect[] = [];
  const draw = (
    box: Box,
    color: string,
    label: string,
    style: 'host' | 'slot' | 'part',
    key: string
  ): void => {
    let el = root.children[i] as HTMLElement | undefined;
    if (el === undefined) {
      el = document.createElement('div');
      el.append(document.createElement('span'));
      root.append(el);
    }
    i++;
    const rect = toRect(box);
    const focused = key === focusKey;
    styleBox(el, rect, color, style, focused);
    const tag = el.firstElementChild as HTMLElement;
    tag.textContent = label;
    // Above the box, or inside it when the box touches the viewport's top.
    const inside = rect.y < LABEL_HEIGHT;
    styleTag(tag, color, style, inside);
    placed.push(placeTag(tag, placed, el.getBoundingClientRect(), inside));
  };
  const finish = (): void => {
    for (let j = i; j < root.children.length; j++) {
      (root.children[j] as HTMLElement).style.display = 'none';
    }
  };
  return {draw, finish};
};

const slotLabel = (slot: HTMLSlotElement): string => {
  const name = slot.name === '' ? 'default slot' : `slot "${slot.name}"`;
  return slot.assignedNodes().length === 0 ? `${name} · fallback` : name;
};

const regionKey = (focus: AnatomyFocus): string =>
  `${focus.kind}:${focus.index}`;

/** Draws `el`'s anatomy, or only the regions whose key `keep` accepts. */
const render = (el: Element, keep: (key: string) => boolean): void => {
  const {draw, finish} = drawer(ensureLayer());
  const host = keep('host') ? boundsOf([el]) : null;
  if (host !== null) {
    draw(host, '#868e96', `<${el.localName}>`, 'host', 'host');
  }
  const slots = slotsOf(el);
  slots.forEach((slot, i) => {
    const box = keep(`slot:${i}`) ? boundsOf(renderedNodesOf(slot)) : null;
    const color = ANATOMY_COLORS[i % ANATOMY_COLORS.length];
    if (box !== null) draw(box, color, slotLabel(slot), 'slot', `slot:${i}`);
  });
  partsOf(el).forEach(({names, element}, j) => {
    const box = keep(`part:${j}`) ? boundsOf([element]) : null;
    const color = ANATOMY_COLORS[(slots.length + j) % ANATOMY_COLORS.length];
    const label = `::part(${names.join(' ')})`;
    if (box !== null) draw(box, color, label, 'part', `part:${j}`);
  });
  finish();
};

/** Hide the anatomy. Cheap and safe before it has ever been drawn. */
export const clearAnatomy = (): void => {
  cancelAnimationFrame(frame);
  target = null;
  focusKey = null;
  layer?.remove();
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
