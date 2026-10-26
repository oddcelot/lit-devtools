import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

/**
 * A count in a pill.
 *
 * The app never imports it, so src/mistakes/imports.ts, which uses it
 * without an import, is reported by missing-import.
 */
@customElement('x-badge')
export class XBadge extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      min-width: 1.5em;
      padding: 0 0.4em;
      border-radius: 999px;
      background: #e0e7ff;
      text-align: center;
    }
  `;

  /** The number shown. */
  @property({type: Number}) count = 0;

  render() {
    return html`${this.count}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'x-badge': XBadge;
  }
}
