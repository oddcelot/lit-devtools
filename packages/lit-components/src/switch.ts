import WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js';
import {css} from 'lit';
import {extendCss} from './styles.js';

/**
 * A Web Awesome switch at the design system's small size. The label is its
 * content; `checked`, `disabled`, `change` and form association are
 * `wa-switch`'s.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitSwitch extends WaSwitch {
  // WA hard-codes a round track and thumb; take them from the theme's corner
  // radius instead, so the switch is square in the square theme even though
  // its pills are round.
  static override css = extendCss(
    WaSwitch.css,
    css`
      .switch,
      .switch .thumb {
        border-radius: var(--wa-border-radius-s);
      }
      /* The whole label is the target; at size s WA's is 15px tall, under
         the 24px a pointer target needs. */
      [part~='base'] {
        min-height: 24px;
      }
    `
  );

  constructor() {
    super();
    this.size = 's';
  }
}

// Called directly: see button.ts.
customElements.define('lit-switch', LitSwitch);

declare global {
  interface HTMLElementTagNameMap {
    'lit-switch': LitSwitch;
  }
}
