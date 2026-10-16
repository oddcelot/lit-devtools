/**
 * Telling a server-rendered element apart, from the DOM alone.
 *
 * Lit's server renderer marks each template it writes with a
 * `<!--lit-part DIGEST-->` comment, and hydration keeps those markers; a
 * template rendered in the browser marks its parts differently. So a shadow
 * root that holds one at its top level came from the server, before and
 * after hydration. Dependency-free: the HMR patch and the inspector both
 * ask.
 *
 * @module
 */

/** Whether `root` holds HTML Lit rendered on the server. */
export const hasServerRender = (root: ParentNode): boolean => {
  // 8 is Node.COMMENT_NODE; `Node` itself is not there in every runtime.
  for (const node of root.childNodes) {
    if (node.nodeType === 8 && (node as Comment).data.startsWith('lit-part '))
      return true;
  }
  return false;
};

/**
 * Where a server-rendered element stands: held back by `defer-hydration`,
 * waiting for its first update, or hydrated. `undefined` for an element the
 * browser rendered.
 */
export type HydrationState = 'deferred' | 'pending' | 'hydrated';

export const hydrationStateOf = (
  el: Element & {hasUpdated?: boolean}
): HydrationState | undefined => {
  const root = el.shadowRoot;
  if (root == null || !hasServerRender(root)) return undefined;
  if (el.hasUpdated === true) return 'hydrated';
  return el.hasAttribute('defer-hydration') ? 'deferred' : 'pending';
};
