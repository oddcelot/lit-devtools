import WaBadge from '@awesome.me/webawesome/dist/components/badge/badge.js';

/**
 * A Web Awesome badge with the Lit Design System's defaults: neutral, in the
 * soft filled-outlined look the design system uses for statuses and tags.
 * The design system's tones are WA variants: accent is `brand`, error is
 * `danger`; `pill` and `attention` are WA's.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitBadge extends WaBadge {
  constructor() {
    super();
    this.variant = 'neutral';
    this.appearance = 'filled-outlined';
  }
}

// Called directly: see button.ts.
customElements.define('lit-badge', LitBadge);

declare global {
  interface HTMLElementTagNameMap {
    'lit-badge': LitBadge;
  }
}
