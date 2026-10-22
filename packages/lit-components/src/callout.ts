import WaCallout from '@awesome.me/webawesome/dist/components/callout/callout.js';
import './icons.js';

/**
 * A Web Awesome callout at the design system's small size, for an inline
 * message. Variants and appearances are `wa-callout`'s; put a `lit-icon` in
 * `slot="icon"`.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitCallout extends WaCallout {
  constructor() {
    super();
    this.size = 's';
  }
}

// Called directly: see button.ts.
customElements.define('lit-callout', LitCallout);

declare global {
  interface HTMLElementTagNameMap {
    'lit-callout': LitCallout;
  }
}
