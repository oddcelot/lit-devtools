import {LitElement, css, html} from 'lit';
import type {OrderStatus} from '../orders.ts';

/**
 * An order's status as a pill. The benchmark page renders one per row, so
 * each row costs a component with its own shadow root on the server, and
 * one more element to hydrate in the browser.
 */
export class OrderStatusPill extends LitElement {
  static override properties = {status: {reflect: true}};

  static override styles = css`
    :host {
      display: inline-block;
      padding: 0 0.5em;
      border-radius: 1em;
      font-size: 0.8em;
      background: var(--wa-color-neutral-fill-quiet);
      color: var(--wa-color-neutral-on-quiet);
    }
    :host([status='paid']) {
      background: var(--wa-color-success-fill-quiet);
      color: var(--wa-color-success-on-quiet);
    }
    :host([status='shipped']) {
      background: var(--wa-color-brand-fill-quiet);
      color: var(--wa-color-brand-on-quiet);
    }
    :host([status='refunded']) {
      background: var(--wa-color-danger-fill-quiet);
      color: var(--wa-color-danger-on-quiet);
    }
  `;

  status: OrderStatus = 'pending';

  override render() {
    return html`${this.status}`;
  }
}
customElements.define('order-status', OrderStatusPill);

declare global {
  interface HTMLElementTagNameMap {
    'order-status': OrderStatusPill;
  }
}
