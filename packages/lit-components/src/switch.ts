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
  // WA hard-codes a round track and thumb; take them from the theme's radii
  // instead, so a theme that squares its corners squares the switch too.
  static override css = extendCss(
    WaSwitch.css,
    css`
      .switch {
        border-radius: var(--wa-border-radius-pill);
      }
      .switch .thumb {
        border-radius: var(--wa-border-radius-circle);
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
