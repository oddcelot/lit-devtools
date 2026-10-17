/**
 * Which elements the component tree has a row for. Split out of collect.ts so
 * collect, anatomy and extras can all ask it without importing one another.
 */

/**
 * An element worth showing in the tree: an upgraded custom element that
 * duck-types as a ReactiveElement. Catches Lit components regardless of whether
 * the source-meta transform touched them, while skipping devtools' own UI.
 */
export const isInspectable = (el: Element): boolean =>
  isCustomTag(el.localName) &&
  typeof (el as {requestUpdate?: unknown}).requestUpdate === 'function';

/**
 * A tag that can name a custom element (it has a hyphen) and isn't devtools
 * UI: ours, the devframes dock the Vite DevTools hub mounts in the page, or
 * Astro's dev toolbar (`<astro-island>` is the page's own, and stays).
 */
const isCustomTag = (tag: string): boolean =>
  tag.includes('-') &&
  tag !== 'lit-source-overlay' &&
  !tag.startsWith('lit-devtools-') &&
  !tag.startsWith('devframes-') &&
  !tag.startsWith('astro-dev-');

/**
 * A custom-element tag nothing has defined: a forgotten import, a typo, a
 * chunk that has not loaded. Plain tags (no hyphen) are never custom, so they
 * skip the selector match. Devtools' own UI is left out as in
 * {@link isInspectable}.
 */
export const isUndefinedElement = (el: Element): boolean => {
  const tag = el.localName;
  if (!isCustomTag(tag)) return false;
  // The registry lookup is the cheap rejection for the usual, defined case;
  // the selector settles the rest, since an element can be defined in a
  // registry other than the global one.
  return customElements.get(tag) === undefined && el.matches(':not(:defined)');
};

/**
 * A custom element another library defined: upgraded, but not a Lit
 * component, so it has no reactive state to read. Listed so the tree shows
 * the whole component structure, not only Lit's part of it.
 */
export const isForeignElement = (el: Element): boolean => {
  if (!isCustomTag(el.localName) || isInspectable(el)) return false;
  // As in isUndefinedElement: the global registry first, the selector for
  // elements defined in another registry. A registered tag counts only once
  // the element is an instance of its class; see isUnupgradedElement.
  const registered = customElements.get(el.localName);
  return registered !== undefined
    ? el instanceof registered
    : el.matches(':defined');
};

/**
 * A custom element whose tag is defined but which never became an instance
 * of its class: its constructor threw during the upgrade, or it was created
 * before the define and not connected since (or in a `<template>`, which
 * never upgrades). It is no Lit component yet, whatever its class is, so it
 * has no state to read.
 */
export const isUnupgradedElement = (el: Element): boolean => {
  if (!isCustomTag(el.localName) || isInspectable(el)) return false;
  const registered = customElements.get(el.localName);
  return registered !== undefined && !(el instanceof registered);
};

/**
 * An element the component tree has a row for: a Lit component, a tag nothing
 * has defined, or a custom element another library defined. Anything that
 * points at a row (the Elements sync, anatomy and extras links) uses this, so
 * it never names an element the tree has flattened away.
 */
export const isListed = (el: Element): boolean =>
  isInspectable(el) ||
  isUndefinedElement(el) ||
  isForeignElement(el) ||
  isUnupgradedElement(el);
