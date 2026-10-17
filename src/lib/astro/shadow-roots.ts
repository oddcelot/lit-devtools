/**
 * Declarative shadow roots for the page an Astro view transition swaps in.
 * Astro parses the next page with `DOMParser`, which leaves each
 * `<template shadowrootmode>` as a template, and attaches them itself only
 * once the new body is in the page. By then every defined Lit element has
 * upgraded, connected and made a shadow root of its own, so Astro drops the
 * server's and the element renders anew; only a deferred element, which
 * doesn't connect, keeps it. Attached here in the parsed document, before
 * the swap, they reach every element as the server sent them, and Lit
 * hydrates them as it would on a page load.
 */

const MODES = new Set(['open', 'closed']);

/** Turns the shadow root templates under `root` into shadow roots. */
export const attachShadowRoots = (root: ParentNode): void => {
  for (const template of root.querySelectorAll<HTMLTemplateElement>(
    'template[shadowrootmode]'
  )) {
    const host = template.parentElement;
    const mode = template.getAttribute('shadowrootmode') ?? '';
    // As the parser would: only a host's first such template, and only a
    // mode it knows.
    if (host === null || host.shadowRoot !== null || !MODES.has(mode)) {
      continue;
    }
    const shadow = host.attachShadow({
      mode: mode as ShadowRootMode,
      delegatesFocus: template.hasAttribute('shadowrootdelegatesfocus'),
    });
    attachShadowRoots(template.content);
    shadow.append(template.content);
    template.remove();
  }
};
