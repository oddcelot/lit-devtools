import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import sheet from './theme.css?css-sheet';

/**
 * Adopts a shared `?css-sheet`. On the server the sheet's css is written into
 * the declarative shadow root, so the styles arrive with the HTML.
 */
@customElement('ssr-themed')
export class SsrThemed extends LitElement {
  static override styles = [sheet];

  override render() {
    return html`<p class="note">Styled by a shared sheet</p>`;
  }
}
