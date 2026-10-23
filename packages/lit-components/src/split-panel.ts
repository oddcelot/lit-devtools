import WaSplitPanel from '@awesome.me/webawesome/dist/components/split-panel/split-panel.js';
import {css} from 'lit';

/**
 * A Web Awesome split panel: two panes, `slot="start"` and `slot="end"`, with
 * a draggable divider between them. `position`, `position-in-pixels`,
 * `primary`, `snap`, `orientation` and the `wa-reposition` event are
 * `wa-split-panel`'s. The DevTools panel's tree beside its details pane.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitSplitPanel extends WaSplitPanel {
  // WA draws a 4px bar, heavier than the panes it splits; a hairline in the
  // surface border, lit in the brand colour while it's hovered or dragged.
  // The hit area stays WA's 0.75rem. WA keeps this one's styles as a
  // single sheet, not a list, so they extend in place.
  static override css = css`
    ${WaSplitPanel.css}
    :host {
      --divider-width: 1px;
    }
    .divider {
      background-color: var(--wa-color-surface-border);
      transition: background-color var(--wa-transition-fast);
    }
    :host(:not([disabled])) .divider:hover,
    :host(:not([disabled])) .divider:active {
      background-color: var(--wa-color-brand-fill-loud);
    }
  `;
}

// Called directly: see button.ts.
customElements.define('lit-split-panel', LitSplitPanel);

declare global {
  interface HTMLElementTagNameMap {
    'lit-split-panel': LitSplitPanel;
  }
}
