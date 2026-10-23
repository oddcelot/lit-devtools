/**
 * Lit Inspector's Lit tab in the Elements sidebar, live, for the landing
 * page: an Elements-style DOM tree of the demo cart, and the panel in its
 * details-only mode beside it, following the tree's selection the way the
 * extension's sidebar follows DevTools' `$0` (extension/src/panel.ts).
 *
 * The tree is built from the cart frame's real DOM, through its open shadow
 * roots, and rebuilt when that DOM changes. A selected node goes through the
 * page runtime's own lookup (`LIT_ID_OF_KEY`), which answers with the Lit
 * element at or around it, and the answer is published with
 * `followElement()`, exactly as the extension publishes its eval of `$0`.
 * Hovering a row outlines the node on the page, as Elements does.
 */
import {followElement} from '../../../../src/panel/followed-element.js';
import {LIT_ID_OF_KEY} from '../../../../src/types/inspector.js';

type IdOf = (node: Node) => number | undefined;

const frame = document.querySelector<HTMLIFrameElement>('iframe.demo')!;
const tree = document.querySelector<HTMLElement>('.dom-tree')!;

/** Nodes whose children show; the cart and its shadow root start open. */
const open = new WeakSet<Node>();
let selected: Node | undefined;
let highlight: HTMLElement | undefined;

const idOf = (node: Node): number | undefined => {
  const lookup = (frame.contentWindow as unknown as Record<symbol, unknown>)[
    LIT_ID_OF_KEY
  ];
  return typeof lookup === 'function' ? (lookup as IdOf)(node) : undefined;
};

// The nodes come from the cart's frame, another realm, where `instanceof
// Element` is false; they are told apart by nodeType instead.
const isElement = (node: Node): node is Element =>
  node.nodeType === Node.ELEMENT_NODE;
const isShadowRoot = (node: Node): node is ShadowRoot =>
  node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;

/** The child nodes Elements would list: elements, shadow roots, text. */
const childrenOf = (node: Node): Node[] => {
  const kids: Node[] = [];
  if (isElement(node) && node.shadowRoot) kids.push(node.shadowRoot);
  for (const child of node.childNodes) {
    // The source overlay is the runtime's, not the page's; Elements would
    // list it, but here it is only noise.
    if (
      isElement(child) &&
      child.localName !== 'script' &&
      child.localName !== 'lit-source-overlay'
    ) {
      kids.push(child);
    } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      kids.push(child);
    }
  }
  return kids;
};

const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** One row's markup: `<tag attr="…">`, a shadow root, or a text node. */
const label = (node: Node): string => {
  if (isShadowRoot(node)) {
    return `<span class="shadow">#shadow-root (${node.mode})</span>`;
  }
  if (!isElement(node)) {
    return `<span class="text">"${escape(node.textContent!.trim())}"</span>`;
  }
  const attrs = [...node.attributes]
    .map(
      (a) =>
        ` <span class="attr">${a.name}</span>=<span class="val">"${escape(a.value)}"</span>`
    )
    .join('');
  const tag = `<span class="tag">&lt;<span class="name">${node.localName}</span>${attrs}&gt;</span>`;
  // An element holding only text reads on one line, as in Elements.
  const kids = childrenOf(node);
  if (kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE) {
    return `${tag}${escape(kids[0].textContent!.trim())}<span class="tag">&lt;/<span class="name">${node.localName}</span>&gt;</span>`;
  }
  return tag;
};

const rows = new Map<HTMLElement, Node>();

const render = () => {
  const doc = frame.contentDocument;
  if (!doc?.body) return;
  rows.clear();
  const out = document.createDocumentFragment();
  const walk = (node: Node, depth: number) => {
    const kids = childrenOf(node);
    const inline = kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE;
    const expandable = kids.length > 0 && !inline;
    const row = document.createElement('div');
    row.className = 'row';
    row.style.setProperty('--depth', String(depth));
    if (node === selected) row.classList.add('selected');
    row.innerHTML = `<span class="twisty">${expandable ? (open.has(node) ? '▾' : '▸') : ''}</span>${label(node)}`;
    rows.set(row, node);
    out.append(row);
    if (expandable && open.has(node)) {
      for (const kid of kids) walk(kid, depth + 1);
    }
  };
  walk(doc.body, 0);
  tree.replaceChildren(out);
};

const select = (node: Node) => {
  selected = node;
  followElement(idOf(node) ?? null);
  render();
};

const outline = (node: Node | undefined) => {
  highlight?.remove();
  highlight = undefined;
  const doc = frame.contentDocument;
  if (!doc || !node || !isElement(node)) return;
  const box = node.getBoundingClientRect();
  highlight = doc.createElement('div');
  Object.assign(highlight.style, {
    position: 'fixed',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    background: 'rgb(111 168 220 / 0.55)',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });
  doc.body.append(highlight);
};

tree.addEventListener('click', (event) => {
  const row = (event.target as Element).closest<HTMLElement>('.row');
  const node = row && rows.get(row);
  if (!node) return;
  if ((event.target as Element).closest('.twisty')) {
    if (open.has(node)) open.delete(node);
    else open.add(node);
    render();
    return;
  }
  select(node);
});
tree.addEventListener('mouseover', (event) => {
  const row = (event.target as Element).closest<HTMLElement>('.row');
  outline(row ? rows.get(row) : undefined);
});
tree.addEventListener('mouseleave', () => outline(undefined));

/** Rebuild when the page changes, inside its shadow roots too. */
const watch = (root: Node) => {
  const observer = new MutationObserver(() => {
    if (!highlight?.isConnected) render();
  });
  const each = (node: Node) => {
    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    for (const el of (node as ParentNode).querySelectorAll?.('*') ?? []) {
      if (el.shadowRoot) each(el.shadowRoot);
    }
  };
  each(root);
};

frame.addEventListener('load', async () => {
  const win = frame.contentWindow!;
  await win.customElements.whenDefined('demo-cart');
  const cart = frame.contentDocument!.querySelector('demo-cart')!;
  await (cart as unknown as {updateComplete: Promise<unknown>}).updateComplete;
  open.add(frame.contentDocument!.body).add(cart).add(cart.shadowRoot!);
  // Open on the second item, as the Components tab does.
  const item = cart.shadowRoot!.querySelectorAll('cart-item')[1];
  watch(frame.contentDocument!.body);
  // The runtime knows the cart once the panel's port is in; ask again until
  // it answers, so the first selection lands.
  const start = Date.now();
  const first = () => {
    if (idOf(item) !== undefined || Date.now() - start > 4000) select(item);
    else setTimeout(first, 150);
  };
  render();
  first();
});
