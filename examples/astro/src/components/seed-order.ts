import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/number-input/number-input.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import type WaNumberInput from '@awesome.me/webawesome/dist/components/number-input/number-input.js';
import type WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js';

const GIFT_WRAP = 2;

/**
 * A seed order drawn with Web Awesome elements. The server renders it and
 * the `<wa-*>` elements inside it as one piece of HTML, and the browser
 * hydrates all of them. Edit this file while the page is open: the order
 * is patched in place, and the packets and the gift wrap stay as you set
 * them.
 *
 * The card's `with-header` and `with-footer` are what Web Awesome asks for
 * under SSR, so the server's HTML lays out the slots before it hydrates.
 */
@customElement('seed-order')
export class SeedOrder extends LitElement {
  static override styles = css`
    :host {
      display: block;
      max-width: 24rem;
    }
    [slot='header'] {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--wa-space-s);
    }
    h3 {
      margin: 0;
      font-size: var(--wa-font-size-l);
    }
    .fields {
      display: grid;
      gap: var(--wa-space-m);
    }
    [slot='footer'] {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--wa-space-s);
    }
    .total {
      font-weight: var(--wa-font-weight-bold);
    }
  `;

  @property() plant = 'Sweet pea';
  @property({type: Number}) price = 3.5;

  @state() private packets = 2;
  @state() private gift = false;
  @state() private ordered = false;

  private get total() {
    return this.packets * this.price + (this.gift ? GIFT_WRAP : 0);
  }

  override render() {
    return html`
      <wa-card with-header with-footer>
        <div slot="header">
          <h3>${this.plant}</h3>
          <wa-badge variant=${this.ordered ? 'success' : 'neutral'}>
            ${this.ordered ? 'Ordered' : `€${this.price.toFixed(2)} a packet`}
          </wa-badge>
        </div>
        <div class="fields">
          <wa-number-input
            label="Packets"
            with-label
            min="1"
            max="20"
            value=${this.packets}
            @input=${(e: Event) =>
              (this.packets = Number((e.target as WaNumberInput).value ?? 1))}
          ></wa-number-input>
          <wa-switch
            ?checked=${this.gift}
            @change=${(e: Event) =>
              (this.gift = (e.target as WaSwitch).checked)}
            >Gift wrap (+€${GIFT_WRAP})</wa-switch
          >
        </div>
        <div slot="footer">
          <span class="total">€${this.total.toFixed(2)}</span>
          <wa-button
            variant="brand"
            ?disabled=${this.ordered}
            @click=${() => (this.ordered = true)}
            >Order</wa-button
          >
        </div>
      </wa-card>
    `;
  }
}
