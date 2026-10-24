import {expect, test} from 'vite-plus/test';
import {createHtmlDocs} from '../../lib/editor/html-data.js';
import {svgData} from '../../lib/editor/svg-data.js';

const data = svgData({
  '*': ['class', 'fill', 'stroke-linejoin', 'nav-down', 'about'],
  path: ['class', 'd', 'fill', 'pathLength', 'focusHighlight', 'nav-up'],
  circle: ['cx', 'cy', 'r'],
  altGlyph: ['x'],
  audio: ['src'],
});

test('keeps the SVG 2 elements, each with only its own attributes', () => {
  expect(data.tags?.map((tag) => tag.name)).toEqual(['circle', 'path']);
  expect(data.tags?.[1].attributes?.map((a) => a.name)).toEqual([
    'd',
    'pathLength',
  ]);
});

test('makes the current shared attributes the global ones', () => {
  expect(data.globalAttributes?.map((a) => a.name)).toEqual([
    'class',
    'fill',
    'stroke-linejoin',
  ]);
});

test('describes, links and lists values', () => {
  const docs = createHtmlDocs(data);
  const path = docs.get('path');
  expect(path?.description).toMatch(/^SVG element\. The generic shape/);
  expect(path?.description).toContain(
    '[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/path)'
  );
  expect(path?.attributes[0]).toMatchObject({
    name: 'd',
    description: expect.stringMatching(/^The path to draw/),
  });
  expect(
    docs.globals.attributes.find((a) => a.name === 'stroke-linejoin')
  ).toMatchObject({
    type: "'miter' | 'miter-clip' | 'round' | 'bevel' | 'arcs'",
  });
});
