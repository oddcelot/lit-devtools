import WaCopyButton from '@awesome.me/webawesome/dist/components/copy-button/copy-button.js';
import './icons.js';

/**
 * A Web Awesome copy button: copies its `value` (or the text of the element
 * `from` points at) and confirms with a tooltip. All `wa-copy-button`'s.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitCopyButton extends WaCopyButton {}

// Called directly: see button.ts.
customElements.define('lit-copy-button', LitCopyButton);

declare global {
  interface HTMLElementTagNameMap {
    'lit-copy-button': LitCopyButton;
  }
}
