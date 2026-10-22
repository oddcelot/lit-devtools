import WaCard from '@awesome.me/webawesome/dist/components/card/card.js';

/**
 * A Web Awesome card: the design system's generic surface. Header, footer,
 * media and actions slots are `wa-card`'s, turned on with `with-header`
 * and the like.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitCard extends WaCard {}

// Called directly: see button.ts.
customElements.define('lit-card', LitCard);

declare global {
  interface HTMLElementTagNameMap {
    'lit-card': LitCard;
  }
}
