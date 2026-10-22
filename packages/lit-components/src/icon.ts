import WaIcon from '@awesome.me/webawesome/dist/components/icon/icon.js';
import './icons.js';

/**
 * A Web Awesome icon drawing from the Phosphor set icons.ts registers.
 * Everything is `wa-icon`'s: `name`, `label`, `src`, `flip`, `animation`.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitIcon extends WaIcon {}

// Called directly: see button.ts.
customElements.define('lit-icon', LitIcon);

declare global {
  interface HTMLElementTagNameMap {
    'lit-icon': LitIcon;
  }
}
