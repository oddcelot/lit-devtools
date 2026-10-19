/**
 * The runtime's own elements in the page's `<body>`: the highlight box, the
 * flash layer, the element picker. A page that swaps in a new `<body>`
 * instead of loading one (Turbo Drive, which webawesome.com uses, and some
 * routers) takes them out with the old one, and they would stay detached:
 * no outline on hover, no flash, no picker. So each one kept here is moved
 * into the new `<body>` as it arrives, by one observer of `<html>`'s own
 * children, which hears of the swap and of nothing else.
 */

const kept = new Set<Element>();
let observer: MutationObserver | undefined;

const restore = (): void => {
  const body = document.body;
  if (body === null) return;
  for (const el of kept) if (!el.isConnected) body.append(el);
};

/**
 * Appends `el` to the `<body>` and keeps it in whichever `<body>` the page
 * has from then on.
 */
export const keepInBody = (el: Element): void => {
  kept.add(el);
  if (!el.isConnected) document.body?.append(el);
  if (observer === undefined && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(restore);
    observer.observe(document.documentElement, {childList: true});
  }
};
