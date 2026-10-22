import WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js';

/**
 * A Web Awesome switch at the design system's small size. The label is its
 * content; `checked`, `disabled`, `change` and form association are
 * `wa-switch`'s.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitSwitch extends WaSwitch {
  constructor() {
    super();
    this.size = 's';
  }
}

// Called directly: see button.ts.
customElements.define('lit-switch', LitSwitch);

declare global {
  interface HTMLElementTagNameMap {
    'lit-switch': LitSwitch;
  }
}
