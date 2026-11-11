import {LitElement, html} from 'lit';
import sheet from './order-status.css?css-sheet';
import type {OrderStatus} from '../orders.ts';

/**
 * An order's status as a pill. The benchmark page renders one per row, so
 * each row costs a component with its own shadow root on the server, and
 * one more element to hydrate in the browser.
 */
export class OrderStatusPill extends LitElement {
  static override properties = {status: {reflect: true}};

  static override styles = sheet;

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
