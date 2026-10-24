/**
 * SVG elements and attributes in the HTML data format `html-data.ts` reads,
 * built from an element-to-attributes map (`svg-element-attributes`, which
 * the language server bundles, passes it in): the elements of SVG 2, each
 * with the attributes only it takes, and the core and presentation
 * attributes every SVG element accepts as the shared ones. Obsolete SVG 1.1
 * and SVG Tiny names are left out.
 *
 * The map has names only, so every entry links to its MDN page, and the
 * common ones carry a short description; attributes with a fixed set of
 * values list them.
 */

import type {HtmlData} from './html-data.js';

const MDN = 'https://developer.mozilla.org/en-US/docs/Web/SVG/Reference';

/** The elements of SVG 2. */
const ELEMENTS = new Set([
  'a',
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'foreignObject',
  'g',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'script',
  'set',
  'stop',
  'style',
  'svg',
  'switch',
  'symbol',
  'text',
  'textPath',
  'title',
  'tspan',
  'use',
  'view',
]);

/** SVG Tiny, SVG 1.1 and RDFa names that SVG 2 dropped or never had. */
const OBSOLETE =
  /^(?:nav-|focusHighlight$|focusable$|externalResourcesRequired$|enable-background$|kerning$|glyph-orientation-|required(?:Features|Fonts|Formats)$|playbackorder$|playbackOrder$|snapshotTime$|sync|timelinebegin$|timelineBegin$|contentScriptType$|contentStyleType$|baseProfile$|version$|zoomAndPan$|color-profile$|clip$|about$|content$|datatype$|property$|rel$|resource$|rev$|typeof$|xml:)/;

const ELEMENT_DESCRIPTIONS: Record<string, string> = {
  svg: 'A container that defines a new coordinate system and viewport. The outermost element of an SVG image.',
  g: 'Groups other SVG elements, so transforms and presentation attributes apply to all of them.',
  path: 'The generic shape: lines, curves and arcs drawn from the commands in its `d` attribute.',
  circle: 'A circle, from a center point (`cx`, `cy`) and a radius (`r`).',
  ellipse:
    'An ellipse, from a center point (`cx`, `cy`) and two radii (`rx`, `ry`).',
  rect: 'A rectangle, from its position, size and optional corner radii (`rx`, `ry`).',
  line: 'A straight line between two points (`x1`, `y1`, `x2`, `y2`).',
  polyline:
    'A set of connected straight lines through the points in `points`, left open.',
  polygon: 'A closed shape of straight lines through the points in `points`.',
  text: 'Draws text, positioned by `x` and `y`.',
  tspan: 'A run of text inside `<text>`, positioned or styled on its own.',
  textPath: 'Draws its text along the shape of a `<path>`.',
  use: 'Draws a copy of another element, referenced by `href`.',
  defs: "Holds elements that aren't drawn themselves, such as gradients and symbols, to be referenced elsewhere.",
  symbol:
    'A graphic template with its own `viewBox`, drawn only where a `<use>` references it.',
  linearGradient:
    'A gradient along a straight line, referenced from `fill` or `stroke` as `url(#id)`.',
  radialGradient:
    'A gradient out from a center point, referenced from `fill` or `stroke` as `url(#id)`.',
  stop: 'A color stop of a gradient, at its `offset`.',
  clipPath:
    'A clipping path: only what falls inside its shapes stays visible, referenced from `clip-path`.',
  mask: "A mask whose luminance sets the visibility of what it's applied to, referenced from `mask`.",
  pattern:
    'A tile repeated to fill or stroke a shape, referenced as `url(#id)`.',
  marker:
    'A graphic drawn at the vertices of a path, line or polyline, through `marker-start`, `marker-mid` and `marker-end`.',
  filter:
    'A set of filter primitives (`fe…` elements), applied through the `filter` attribute.',
  image: 'Draws a raster or SVG image, from `href`.',
  foreignObject:
    'Holds elements from another namespace, usually HTML, inside the SVG.',
  title:
    'An accessible, short text alternative for its parent element, often shown as a tooltip.',
  desc: 'An accessible, longer description of its parent element.',
  a: 'A link around the SVG elements it contains.',
  animate: 'Animates an attribute of its parent element over time.',
};

const ATTRIBUTE_DESCRIPTIONS: Record<string, string> = {
  d: 'The path to draw, as commands: `M` move, `L` line, `H`/`V` horizontal/vertical line, `C`/`S` cubic and `Q`/`T` quadratic curve, `A` arc, `Z` close. Lowercase commands are relative.',
  viewBox:
    'The area of the user coordinate system that the viewport shows: `min-x min-y width height`.',
  preserveAspectRatio:
    'How the `viewBox` fits the viewport when their aspect ratios differ: an alignment such as `xMidYMid`, then `meet` or `slice`.',
  fill: 'The paint inside the shape: a color, `none`, or `url(#id)` of a gradient or pattern.',
  stroke:
    'The paint of the outline: a color, `none`, or `url(#id)` of a gradient or pattern.',
  'stroke-width': 'The width of the outline.',
  'stroke-linecap': 'The shape at the open ends of a stroked line.',
  'stroke-linejoin': 'The shape where two segments of a stroked line meet.',
  'stroke-dasharray':
    'The pattern of dashes and gaps used to stroke the outline.',
  'stroke-dashoffset': 'How far into the dash pattern the stroke starts.',
  'fill-rule':
    'How the inside of a shape is decided where its outline crosses itself.',
  'clip-rule':
    'How the inside of a clipping path is decided where its outline crosses itself.',
  opacity: 'The opacity of the element and its children, from 0 to 1.',
  'fill-opacity': 'The opacity of the fill, from 0 to 1.',
  'stroke-opacity': 'The opacity of the stroke, from 0 to 1.',
  transform:
    'A list of transforms applied to the element: `translate()`, `rotate()`, `scale()`, `skewX()`, `skewY()`, `matrix()`.',
  'text-anchor':
    'Where text sits relative to its `x`: at its start, middle or end.',
  'dominant-baseline': 'Which baseline of the text aligns with its `y`.',
  points: 'The points of a polyline or polygon, as `x,y` pairs.',
  href: 'The URL or `#id` of the element or resource referenced.',
  cx: 'The x coordinate of the center.',
  cy: 'The y coordinate of the center.',
  r: 'The radius.',
  rx: 'The horizontal radius, or corner radius.',
  ry: 'The vertical radius, or corner radius.',
  x: 'The x coordinate.',
  y: 'The y coordinate.',
  x1: 'The x coordinate of the start.',
  y1: 'The y coordinate of the start.',
  x2: 'The x coordinate of the end.',
  y2: 'The y coordinate of the end.',
  width: 'The width.',
  height: 'The height.',
  pathLength:
    'The total length of the path in user units, against which stroke dashes and markers are measured.',
  offset: 'Where the stop sits along the gradient, from 0 to 1 or 0% to 100%.',
  'stop-color': 'The color of a gradient stop.',
  'stop-opacity': 'The opacity of a gradient stop.',
  'clip-path':
    'The clipping path applied: `url(#id)` of a `<clipPath>`, or a basic shape.',
  mask: 'The mask applied: `url(#id)` of a `<mask>`.',
  filter:
    'The filter applied: `url(#id)` of a `<filter>`, or filter functions.',
  'vector-effect':
    'Draws the stroke unaffected by transforms with `non-scaling-stroke`.',
  'pointer-events': 'Which parts of the element receive pointer events.',
  visibility: 'Whether the element is drawn, keeping its place either way.',
  display: 'Whether the element is rendered at all.',
};

const VALUES: Record<string, string[]> = {
  'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'miter-clip', 'round', 'bevel', 'arcs'],
  'fill-rule': ['nonzero', 'evenodd'],
  'clip-rule': ['nonzero', 'evenodd'],
  'text-anchor': ['start', 'middle', 'end'],
  'dominant-baseline': [
    'auto',
    'text-bottom',
    'alphabetic',
    'ideographic',
    'middle',
    'central',
    'mathematical',
    'hanging',
    'text-top',
  ],
  visibility: ['visible', 'hidden', 'collapse'],
  'vector-effect': [
    'none',
    'non-scaling-stroke',
    'non-scaling-size',
    'non-rotation',
    'fixed-position',
  ],
  'pointer-events': [
    'bounding-box',
    'visiblePainted',
    'visibleFill',
    'visibleStroke',
    'visible',
    'painted',
    'fill',
    'stroke',
    'all',
    'none',
  ],
  'shape-rendering': [
    'auto',
    'optimizeSpeed',
    'crispEdges',
    'geometricPrecision',
  ],
  'paint-order': ['normal', 'fill', 'stroke', 'markers'],
};

const reference = (kind: 'Element' | 'Attribute', name: string) => [
  {name: 'MDN Reference', url: `${MDN}/${kind}/${name}`},
];

const attribute = (name: string) => ({
  name,
  ...(ATTRIBUTE_DESCRIPTIONS[name]
    ? {description: ATTRIBUTE_DESCRIPTIONS[name]}
    : {}),
  ...(VALUES[name]
    ? {values: VALUES[name].map((value) => ({name: value}))}
    : {}),
  references: reference('Attribute', name),
});

/** The SVG elements and attributes of `map` (element name to attribute names, `*` for every element's). */
export const svgData = (
  map: Readonly<Record<string, readonly string[]>>
): HtmlData => {
  const current = (name: string) => !OBSOLETE.test(name);
  const shared = new Set((map['*'] ?? []).filter(current));
  const tags = Object.keys(map)
    .filter((name) => ELEMENTS.has(name))
    .sort()
    .map((name) => ({
      name,
      description: `SVG element.${ELEMENT_DESCRIPTIONS[name] ? ` ${ELEMENT_DESCRIPTIONS[name]}` : ''}`,
      attributes: (map[name] ?? [])
        .filter((a) => current(a) && !shared.has(a))
        .map(attribute),
      references: reference('Element', name),
    }));
  return {tags, globalAttributes: [...shared].sort().map(attribute)};
};
