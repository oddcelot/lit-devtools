import WaButton from '@awesome.me/webawesome/dist/components/button/button.js';
import {css} from 'lit';
import {extendCss} from './styles.js';
import './icons.js';

const FORWARDED_ARIA = ['aria-pressed', 'aria-expanded', 'aria-haspopup'];

/**
 * A Web Awesome button with the Lit Design System's defaults: the brand
 * variant, small. Everything else is `wa-button`'s: attributes, slots,
 * parts, events and form association.
 *
 * The design system's named looks, as attributes:
 * - primary: the defaults
 * - secondary: `variant="neutral" appearance="outlined"`
 * - ghost: `variant="neutral" appearance="plain"`
 *
 * Importing this module also registers `wa-button`, which the class defines.
 */
export class LitButton extends WaButton {
  // WA centres a slotted `wa-icon` in the label; the same for `lit-icon`.
  static override css = extendCss(
    WaButton.css,
    css`
      .label::slotted(lit-icon) {
        align-self: center;
      }
    `
  );

  // ARIA state set on the host, by a caller or by wa-dropdown (which only
  // reaches into a trigger tagged wa-button): the host has no role, so it
  // moves to the button inside, where assistive tech reads it.
  static override get observedAttributes() {
    return [...super.observedAttributes, ...FORWARDED_ARIA];
  }

  private readonly forwardedAria = new Map<string, string>();

  constructor() {
    super();
    this.variant = 'brand';
    this.size = 's';
  }

  override attributeChangedCallback(
    name: string,
    old: string | null,
    value: string | null
  ) {
    if (!FORWARDED_ARIA.includes(name)) {
      super.attributeChangedCallback(name, old, value);
      return;
    }
    // null is the removal just below.
    if (value === null) return;
    this.forwardedAria.set(name, value);
    this.removeAttribute(name);
    this.requestUpdate();
  }

  protected override updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    const base = this.shadowRoot?.querySelector('[part~="base"]');
    for (const [name, value] of this.forwardedAria) {
      base?.setAttribute(name, value);
    }
  }
}

// Called directly, not through a helper: the plugin finds components by
// this call, and in dev it turns a repeat (an HMR re-run) into a patch of
// the registered class.
customElements.define('lit-button', LitButton);

declare global {
  interface HTMLElementTagNameMap {
    'lit-button': LitButton;
  }
}
