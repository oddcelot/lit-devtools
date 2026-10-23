/**
 * The app the landing page's live panel inspects: a cart of three items and
 * a summary, small enough to show whole above the panel. It is built to
 * give the panel something to explain. The cart owns the quantities and
 * passes them down, so a click on one item's stepper updates that item, the
 * cart and the summary, and the other two items stay put; the Components
 * tab shows the properties that flow down, and editing one there does what
 * the stepper does.
 *
 * Plain `static properties`, no decorators: the docs build runs without the
 * plugin's dev-server transforms.
 */
import {LitElement, css, html} from 'lit';

interface Item {
  name: string;
  price: number;
  qty: number;
  hue: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const FREE_SHIPPING = 60;

class DemoCart extends LitElement {
  static properties = {items: {state: true}};

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.2fr);
      gap: 0.75rem;
    }
    @media (max-width: 40rem) {
      :host {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  declare items: Item[];

  constructor() {
    super();
    this.items = [
      {name: 'Lit mug', price: 14, qty: 1, hue: 232},
      {name: 'Flame tee', price: 24, qty: 0, hue: 186},
      {name: 'Sticker pack', price: 6, qty: 2, hue: 268},
    ];
  }

  #setQty(name: string, qty: number) {
    this.items = this.items.map((item) =>
      item.name === name ? {...item, qty: Math.max(0, qty)} : item
    );
  }

  override render() {
    const count = this.items.reduce((n, i) => n + i.qty, 0);
    const total = this.items.reduce((n, i) => n + i.qty * i.price, 0);
    return html`
      ${this.items.map(
        (item) => html`
          <cart-item
            .name=${item.name}
            .price=${item.price}
            .qty=${item.qty}
            .hue=${item.hue}
            @qty-change=${(e: CustomEvent<number>) =>
              this.#setQty(item.name, e.detail)}
          ></cart-item>
        `
      )}
      <cart-summary .count=${count} .total=${total}></cart-summary>
    `;
  }
}

class CartItem extends LitElement {
  static properties = {
    name: {},
    price: {type: Number},
    qty: {type: Number},
    hue: {type: Number},
  };

  static styles = css`
    :host {
      display: grid;
      gap: 0.5rem;
      padding: 0.8rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
      font: 0.88rem/1.3 var(--font-sans);
      color: var(--text);
    }
    .swatch {
      height: 2.6rem;
      border-radius: var(--radius-sm);
      background: hsl(var(--hue) 90% 62% / 0.85);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    strong {
      color: var(--text-strong);
    }
    .price {
      color: var(--text-muted);
    }
    .stepper {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
    }
    button {
      width: 1.7rem;
      height: 1.6rem;
      border: 0;
      background: none;
      color: var(--text-strong);
      font: 700 0.95rem/1 var(--font-sans);
      cursor: pointer;
      border-radius: var(--radius-pill);
    }
    button:hover {
      background: var(--surface-hover);
    }
    output {
      min-width: 1.4rem;
      text-align: center;
      font-weight: 700;
    }
  `;

  declare name: string;
  declare price: number;
  declare qty: number;
  declare hue: number;

  constructor() {
    super();
    this.name = '';
    this.price = 0;
    this.qty = 0;
    this.hue = 232;
  }

  #change(qty: number) {
    this.dispatchEvent(new CustomEvent('qty-change', {detail: qty}));
  }

  override render() {
    return html`
      <div class="swatch" style="--hue: ${this.hue}"></div>
      <div class="row">
        <strong>${this.name}</strong>
        <span class="price">${money(this.price)}</span>
      </div>
      <div class="row">
        <span class="stepper">
          <button
            aria-label="One fewer"
            @click=${() => this.#change(this.qty - 1)}
          >
            −
          </button>
          <output>${this.qty}</output>
          <button
            aria-label="One more"
            @click=${() => this.#change(this.qty + 1)}
          >
            +
          </button>
        </span>
        <span>${money(this.qty * this.price)}</span>
      </div>
    `;
  }
}

class CartSummary extends LitElement {
  static properties = {
    count: {type: Number},
    total: {type: Number},
  };

  static styles = css`
    :host {
      display: grid;
      align-content: space-between;
      gap: 0.5rem;
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--accent);
      border-radius: var(--radius-md);
      background: var(--accent-soft);
      font: 0.88rem/1.3 var(--font-sans);
      color: var(--text);
    }
    .total {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-strong);
    }
    .bar {
      height: 0.4rem;
      border-radius: var(--radius-pill);
      background: var(--surface-container-high);
      overflow: hidden;
    }
    .bar div {
      height: 100%;
      background: var(--accent);
      transition: width var(--dur-normal) var(--ease-standard);
    }
    small {
      color: var(--text-secondary);
    }
  `;

  declare count: number;
  declare total: number;

  constructor() {
    super();
    this.count = 0;
    this.total = 0;
  }

  override render() {
    const left = FREE_SHIPPING - this.total;
    return html`
      <span>${this.count} ${this.count === 1 ? 'item' : 'items'}</span>
      <span class="total">${money(this.total)}</span>
      <div class="bar">
        <div
          style="width: ${Math.min(100, (this.total / FREE_SHIPPING) * 100)}%"
        ></div>
      </div>
      <small
        >${
          left > 0
            ? `${money(left)} to free shipping`
            : 'Free shipping unlocked'
        }</small
      >
    `;
  }
}

customElements.define('demo-cart', DemoCart);
customElements.define('cart-item', CartItem);
customElements.define('cart-summary', CartSummary);
