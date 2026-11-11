import {LitElement} from 'lit';

/**
 * J and K step through the routing menu, next and previous: quick presses
 * leave pages behind before they arrive, and the router drops them, on the
 * server too. Full-load and external links are skipped.
 *
 * A LitElement, not a plain HTMLElement, which doesn't exist on the server
 * that renders the layout. It renders nothing.
 */
export class MenuKeys extends LitElement {
  /** The link the last key went to, until its page has arrived. */
  #target: number | undefined;

  #onKey = (event: KeyboardEvent) => {
    const step = stepOf(event);
    if (!step) return;
    const links = menuLinks();
    const from =
      this.#target ?? links.findIndex((link) => link.ariaCurrent === 'page');
    this.#target = (from + step + links.length) % links.length;
    event.preventDefault();
    links[this.#target]!.click();
  };

  #onArrived = () => {
    this.#target = undefined;
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#onKey);
    navigationOf()?.addEventListener('navigatesuccess', this.#onArrived);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#onKey);
    navigationOf()?.removeEventListener('navigatesuccess', this.#onArrived);
  }
}
const STEPS: Record<string, number | undefined> = {j: 1, k: -1};

/** J or K, pressed on its own and not into a field: the step to take. */
const stepOf = (event: KeyboardEvent) =>
  modified(event) || typing(event) ? undefined : STEPS[event.key];

const navigationOf = () => (window as {navigation?: EventTarget}).navigation;

const modified = (event: KeyboardEvent) =>
  event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented;

const FIELDS = ['INPUT', 'TEXTAREA', 'SELECT'];

/** A key typed into a field, Web Awesome's included: not for the menu. */
const typing = (event: KeyboardEvent) => {
  // The innermost target: inside a shadow root, the field itself.
  const target = event.composedPath()[0] as HTMLElement;
  return target.isContentEditable || FIELDS.includes(target.tagName);
};

const menuLinks = () =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>('#menu a')).filter(
    (link) => !link.hasAttribute('data-reload') && link.rel !== 'external'
  );

// Last: the element is already in the server's HTML, so defining it
// upgrades it at once, and connectedCallback needs the helpers above.
customElements.define('menu-keys', MenuKeys);

declare global {
  interface HTMLElementTagNameMap {
    'menu-keys': MenuKeys;
  }
}
