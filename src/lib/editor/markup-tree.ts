/**
 * Which element holds which in a markup region. The scanner reads start
 * tags only; this pairs them with their closing tags, outside the region's
 * holes, as HTML would for well-formed markup: void elements and `/>` on a
 * component close at once, and a closing tag closes the nearest open
 * element of its name and whatever it holds.
 */

import {type MarkupElement, type MarkupRegion, scanMarkup} from './markup.js';

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

export const inHole = (region: MarkupRegion, offset: number): boolean =>
  region.holes.some((hole) => hole.start <= offset && offset < hole.end);

/** The closing tags in a region, outside its holes, lowercased. */
export const closingTags = (
  code: string,
  region: MarkupRegion
): {tag: string; at: number}[] => {
  const text = code.slice(region.start, region.end);
  const tags: {tag: string; at: number}[] = [];
  for (const match of text.matchAll(/<\/([A-Za-z][^\s/>]*)\s*>/g)) {
    const at = region.start + match.index;
    if (!inHole(region, at)) tags.push({tag: match[1].toLowerCase(), at});
  }
  return tags;
};

/** Whether `<x />` closes the element: in HTML, void elements only, and SVG. */
const closesAtOnce = (code: string, element: MarkupElement): boolean =>
  VOID.has(element.tag.toLowerCase()) ||
  (element.closed && code[element.end - 2] === '/');

/** Each element of a region with the element it sits in, if any. */
export const elementParents = (
  code: string,
  region: MarkupRegion
): {element: MarkupElement; parent?: MarkupElement}[] => {
  const events = [
    ...scanMarkup(code, region).map((element) => ({
      at: element.start,
      element,
      tag: element.tag.toLowerCase(),
    })),
    ...closingTags(code, region).map((close) => ({...close, element: null})),
  ].sort((a, b) => a.at - b.at);
  const stack: MarkupElement[] = [];
  const result: {element: MarkupElement; parent?: MarkupElement}[] = [];
  for (const {element, tag} of events) {
    if (element) {
      const parent = stack.at(-1);
      result.push(parent ? {element, parent} : {element});
      if (!closesAtOnce(code, element)) stack.push(element);
      continue;
    }
    let match = stack.length - 1;
    while (match >= 0 && stack[match].tag.toLowerCase() !== tag) match--;
    if (match !== -1) stack.splice(match);
  }
  return result;
};
