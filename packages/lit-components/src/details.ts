import WaDetails from '@awesome.me/webawesome/dist/components/details/details.js';
import './icons.js';

/**
 * A Web Awesome details: a summary that expands to show more. `summary`,
 * `open`, `appearance` and `icon-placement` are `wa-details`'s.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitDetails extends WaDetails {}

// Called directly: see button.ts.
customElements.define('lit-details', LitDetails);

declare global {
  interface HTMLElementTagNameMap {
    'lit-details': LitDetails;
  }
}
