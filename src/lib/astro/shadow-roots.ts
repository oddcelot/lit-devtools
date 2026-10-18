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
 *
 * Where a browser scopes custom element registries, a shadow root attached
 * in the parsed document has none (that document has no registry, and a
 * shadow root can't name one from another document), and it keeps none
 * after the swap: the elements inside it would never upgrade. So the roots
 * are returned, for `boot.ts` to hand them the page's registry once they
 * are in the page.
 */

const MODES = new Set(['open', 'closed']);

/**
 * Turns the shadow root templates under `root` into shadow roots, and
 * returns them, nested ones included.
 */
export const attachShadowRoots = (root: ParentNode): ShadowRoot[] => {
  const attached: ShadowRoot[] = [];
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
    attached.push(shadow, ...attachShadowRoots(template.content));
    shadow.append(template.content);
    template.remove();
  }
  return attached;
};

/** A registry with `initialize`, which scoped registries add. */
interface InitializingRegistry {
  initialize?(root: Node): void;
}

/**
 * Hands `roots`, attached in another document and now in this page, the
 * page's custom element registry, which upgrades the elements inside them.
 * A browser without scoped registries has no `initialize`, and no need.
 */
export const adoptShadowRoots = (roots: readonly ShadowRoot[]): void => {
  const registry = customElements as unknown as InitializingRegistry;
  if (registry.initialize === undefined) return;
  for (const root of roots) {
    try {
      registry.initialize(root);
    } catch {
      // Already given one (another script got there first): leave it.
    }
  }
};
