import WaSelect from '@awesome.me/webawesome/dist/components/select/select.js';
import './icons.js';

/**
 * A Web Awesome select at the design system's small size. Its options are
 * `wa-option` elements: WA finds them by that tag, so there is no
 * lit-option.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitSelect extends WaSelect {
  constructor() {
    super();
    this.size = 's';
  }
}

// Called directly: see button.ts.
customElements.define('lit-select', LitSelect);

declare global {
  interface HTMLElementTagNameMap {
    'lit-select': LitSelect;
  }
}
