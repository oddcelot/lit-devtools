import WaButton from '@awesome.me/webawesome/dist/components/button/button.js';
import './icons.js';

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
  constructor() {
    super();
    this.variant = 'brand';
    this.size = 's';
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
