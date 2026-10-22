import WaSplitPanel from '@awesome.me/webawesome/dist/components/split-panel/split-panel.js';

/**
 * A Web Awesome split panel: two panes, `slot="start"` and `slot="end"`, with
 * a draggable divider between them. `position`, `position-in-pixels`,
 * `primary`, `snap`, `orientation` and the `wa-reposition` event are
 * `wa-split-panel`'s. The DevTools panel's tree beside its details pane.
 *
 * Importing this module also registers the `wa-*` tag the class defines.
 */
export class LitSplitPanel extends WaSplitPanel {}

// Called directly: see button.ts.
customElements.define('lit-split-panel', LitSplitPanel);

declare global {
  interface HTMLElementTagNameMap {
    'lit-split-panel': LitSplitPanel;
  }
}
