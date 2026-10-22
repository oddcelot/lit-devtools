import WaInput from '@awesome.me/webawesome/dist/components/input/input.js';
import './icons.js';

/**
 * A Web Awesome input at the design system's small size. Put a `lit-icon`
 * in `slot="start"` for the DevTools-style filter field; everything else
 * (`with-clear`, `type`, validation, form association) is `wa-input`'s.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitInput extends WaInput {
  constructor() {
    super();
    this.size = 's';
  }
}

// Called directly: see button.ts.
customElements.define('lit-input', LitInput);

declare global {
  interface HTMLElementTagNameMap {
    'lit-input': LitInput;
  }
}
