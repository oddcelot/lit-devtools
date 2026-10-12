/**
 * Names an element so it can be found again after a reload, when the numeric
 * ids the inspector uses have been minted afresh.
 *
 * An element the transform stamped with its template call site is named by
 * that site and its place among the elements stamped with the same site, in
 * document order (shadow trees included, each after its host). Anything else
 * is named by its tag and its path from the document: child indexes, with a
 * hop into a shadow root marked. Both shift when a list reorders or a
 * conditional renders differently; a key that finds the wrong element of the
 * right tag is caught by `setProp`'s guards, or not at all, which is the
 * price of matching without help from the app.
 */

import {CALL_SITE_ATTR} from '../source-meta.js';
import type {ElementKey} from '../../../types/inspector.js';

export type {ElementKey};

/** The parent to step up to, and whether that step leaves a shadow root. */
const up = (el: Element): {parent: Element; shadow: boolean} | undefined => {
  if (el.parentElement !== null)
    return {parent: el.parentElement, shadow: false};
  const root = el.getRootNode();
  return root instanceof ShadowRoot
    ? {parent: root.host, shadow: true}
    : undefined;
};

const pathOf = (el: Element): string => {
  const steps: string[] = [];
  for (let at: Element = el; ;) {
    const parent = at.parentNode;
    const index =
      parent === null ? 0 : Array.prototype.indexOf.call(parent.children, at);
    steps.push(String(index));
    const next = up(at);
    if (next === undefined) break;
    if (next.shadow) steps.push('s');
    at = next.parent;
  }
  return steps.reverse().join('/');
};

/** Every element in document order, each shadow tree right after its host. */
export function* deepElements(root: ParentNode): Generator<Element> {
  for (const child of root.children) {
    yield child;
    if (child.shadowRoot !== null) yield* deepElements(child.shadowRoot);
    yield* deepElements(child);
  }
}

const nthOf = (el: Element, site: string): number => {
  let n = 0;
  for (const other of deepElements(el.ownerDocument)) {
    if (other === el) return n;
    if (other.getAttribute(CALL_SITE_ATTR) === site) n++;
  }
  return n;
};

/** The key `el` would be found by after a reload. */
export const keyOf = (el: Element): ElementKey => {
  const site = el.getAttribute(CALL_SITE_ATTR);
  return site === null
    ? {tag: el.localName, path: pathOf(el)}
    : {tag: el.localName, site, nth: nthOf(el, site)};
};

/** Whether `key` names `el`. */
export const matchesKey = (el: Element, key: ElementKey): boolean => {
  if (el.localName !== key.tag) return false;
  const site = el.getAttribute(CALL_SITE_ATTR);
  if ((site ?? undefined) !== key.site) return false;
  return site === null ? pathOf(el) === key.path : nthOf(el, site) === key.nth;
};

/** The element `key` names in `doc`, if there is one. */
export const findByKey = (
  key: ElementKey,
  doc: Document = document
): Element | undefined => {
  let n = 0;
  for (const el of deepElements(doc)) {
    if (key.site === undefined) {
      if (el.localName === key.tag && pathOf(el) === key.path) return el;
      continue;
    }
    if (el.getAttribute(CALL_SITE_ATTR) !== key.site) continue;
    if (n++ === key.nth) return el.localName === key.tag ? el : undefined;
  }
  return undefined;
};
