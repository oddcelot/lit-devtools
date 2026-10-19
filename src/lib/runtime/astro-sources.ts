/**
 * Where Astro's dev server says an element of `.astro` markup is written.
 *
 * Astro marks each such element with `data-astro-source-file` (an absolute
 * path) and `data-astro-source-loc` (`<line>:<column>`), and its dev toolbar
 * takes both off the element into a map of its own once its audit app runs,
 * again after every page swap. So they are read when this module loads and
 * caught as they are removed, and kept here per element; the element's own
 * attributes are read first, for a page that has no toolbar.
 *
 * Installs itself on import where there is a document; elsewhere (the
 * transform imports `source-meta.ts` for its attribute name) it does nothing.
 */

const ASTRO_SOURCE_FILE_ATTR = 'data-astro-source-file';
const ASTRO_SOURCE_LOC_ATTR = 'data-astro-source-loc';

interface AstroSource {
  file?: string;
  loc?: string;
}

const kept = new WeakMap<Element, AstroSource>();

const keep = (el: Element, attr: string, value: string): void => {
  const source = kept.get(el) ?? {};
  if (attr === ASTRO_SOURCE_FILE_ATTR) source.file = value;
  else source.loc = value;
  kept.set(el, source);
};

const install = (): void => {
  const root = document.documentElement;
  if (root === null) return;
  for (const el of document.querySelectorAll(`[${ASTRO_SOURCE_FILE_ATTR}]`)) {
    for (const attr of [ASTRO_SOURCE_FILE_ATTR, ASTRO_SOURCE_LOC_ATTR]) {
      const value = el.getAttribute(attr);
      if (value !== null) keep(el, attr, value);
    }
  }
  new MutationObserver((records) => {
    for (const {target, attributeName, oldValue} of records) {
      const el = target as Element;
      if (attributeName === null || oldValue === null) continue;
      if (el.hasAttribute(attributeName)) continue;
      keep(el, attributeName, oldValue);
    }
  }).observe(root, {
    subtree: true,
    attributeFilter: [ASTRO_SOURCE_FILE_ATTR, ASTRO_SOURCE_LOC_ATTR],
    attributeOldValue: true,
  });
};

if (
  typeof document !== 'undefined' &&
  typeof MutationObserver !== 'undefined'
) {
  install();
}

/**
 * `<file>:<line>:<column>` of where Astro says `el` is written, or
 * `undefined` for an element Astro did not mark.
 */
export const astroCallSite = (el: Element): string | undefined => {
  const source = kept.get(el);
  const file = el.getAttribute(ASTRO_SOURCE_FILE_ATTR) ?? source?.file;
  const loc = el.getAttribute(ASTRO_SOURCE_LOC_ATTR) ?? source?.loc;
  return file === undefined || loc === undefined ? undefined : `${file}:${loc}`;
};
