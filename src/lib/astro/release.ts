/**
 * Lets an element the Astro renderer deferred hydrate: sets the properties
 * its HTML couldn't carry, then removes the marker and `defer-hydration`.
 * Only for elements carrying the marker, so a `defer-hydration` written by
 * hand is left for its author to remove.
 */

import {PROPS_ATTRIBUTE, decodeProperties} from './props.js';

export const release = (
  element: HTMLElement,
  properties: Record<string, unknown>
): void => {
  Object.assign(element, properties);
  element.removeAttribute(PROPS_ATTRIBUTE);
  element.removeAttribute('defer-hydration');
};

/**
 * Releases every deferred element outside an island once its class is
 * defined, with the properties its marker carries. Islands are left to the
 * client renderer, which gets their props from Astro.
 */
export const releaseMarked = (root: ParentNode = document): void => {
  for (const element of root.querySelectorAll<HTMLElement>(
    `[${PROPS_ATTRIBUTE}]`
  )) {
    if (element.closest('astro-island') !== null) continue;
    const json = element.getAttribute(PROPS_ATTRIBUTE) ?? '';
    void customElements.whenDefined(element.localName).then(() => {
      // Released already, by an earlier pass over the same page.
      if (!element.hasAttribute(PROPS_ATTRIBUTE)) return;
      release(element, decodeProperties(json));
    });
  }
};
