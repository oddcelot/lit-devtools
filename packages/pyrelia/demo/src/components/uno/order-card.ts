import {LitElement, html, nothing} from 'lit';
import uno from '../../uno.generated.css?css-sheet';
import type {OrderStatus} from '../../orders.ts';

const money = new Intl.NumberFormat('en', {style: 'currency', currency: 'EUR'});
const day = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

// Whole class names, so UnoCSS finds them in the source.
const STATUS: Record<OrderStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  shipped: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};
const AVATAR = [
  'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100',
  'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100',
  'bg-teal-200 text-teal-900 dark:bg-teal-800 dark:text-teal-100',
  'bg-pink-200 text-pink-900 dark:bg-pink-800 dark:text-pink-100',
];

/**
 * An order as a card, styled with UnoCSS utilities alone: its shadow root
 * adopts the one sheet `unoSheet()` writes, which every card shares. Its
 * data comes in attributes, so a page that isn't hydrated still renders
 * it, and the Details button has state of its own to hydrate. Its `dark:`
 * utilities follow the system's colour scheme, as the page does.
 */
export class OrderCard extends LitElement {
  static override properties = {
    orderId: {type: Number, attribute: 'order-id'},
    customer: {},
    email: {},
    city: {},
    product: {},
    quantity: {type: Number},
    total: {type: Number},
    status: {},
    placed: {},
    tags: {},
    open: {state: true},
  };

  static override styles = uno;

  orderId = 0;
  customer = '';
  email = '';
  city = '';
  product = '';
  quantity = 1;
  /** In cents. */
  total = 0;
  status: OrderStatus = 'pending';
  /** ISO 8601. */
  placed = '';
  /** Comma-separated. */
  tags = '';
  open = false;

  override render() {
    const initials = this.customer
      .split(' ')
      .map((part) => part[0])
      .join('');
    return html`
      <article
        class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg border border-solid border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        <div
          class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${
            AVATAR[this.orderId % AVATAR.length]
          }"
        >
          ${initials}
        </div>
        <div class="flex-1 min-w-48">
          <div class="font-medium">${this.customer}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            ${this.email} · ${this.city}
          </div>
        </div>
        <div class="text-sm text-gray-700 dark:text-gray-300 w-40">
          ${this.quantity} × ${this.product}
        </div>
        <div class="font-semibold tabular-nums w-24 text-right">
          ${money.format(this.total / 100)}
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full ${STATUS[this.status]}"
          >${this.status}</span
        >
        <button
          class="text-xs px-2 py-1 rounded-md border border-solid border-gray-300 bg-gray-50 text-gray-700 cursor-pointer hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-expanded=${this.open ? 'true' : 'false'}
          @click=${() => (this.open = !this.open)}
        >
          Details
        </button>
        ${
          this.open
            ? html`<div
                class="w-full flex flex-wrap gap-2 pt-2 mt-1 border-t border-t-solid border-gray-100 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400"
              >
                <span>#${this.orderId}</span>
                <span>Placed ${day.format(new Date(this.placed))}</span>
                ${this.tags
                  .split(',')
                  .filter(Boolean)
                  .map(
                    (tag) =>
                      html`<span
                        class="px-1.5 rounded bg-gray-100 dark:bg-gray-800"
                        >${tag}</span
                      >`
                  )}
              </div>`
            : nothing
        }
      </article>
    `;
  }
}
customElements.define('order-card', OrderCard);

declare global {
  interface HTMLElementTagNameMap {
    'order-card': OrderCard;
  }
}
