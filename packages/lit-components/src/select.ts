import WaSelect from '@awesome.me/webawesome/dist/components/select/select.js';
import {css} from 'lit';
import {disabledField, extendCss} from './styles.js';
import './icons.js';

/**
 * A Web Awesome select at the design system's small size. Its options are
 * `wa-option` elements: WA finds them by that tag, so there is no
 * lit-option.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitSelect extends WaSelect {
  // WA greys a multi-select's tags (quiet text on a quiet fill), which read
  // as disabled; give them the field's own text and outline. A disabled
  // select gets the shared disabled look, so it can't pass for one showing
  // its placeholder.
  static override css = extendCss(
    WaSelect.css,
    css`
      .tags wa-tag {
        color: var(--wa-color-text-normal);
        border-color: var(--wa-color-neutral-border-loud);
      }
    `,
    disabledField('.combobox')
  );

  constructor() {
    super();
    this.size = 's';
  }
}

// Called directly: see button.ts.
customElements.define('lit-select', LitSelect);

declare global {
  interface HTMLElementTagNameMap {
    'lit-select': LitSelect;
  }
}
