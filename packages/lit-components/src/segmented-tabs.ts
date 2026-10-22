import {LitElement, css, html, nothing} from 'lit';
import {property} from 'lit/decorators.js';
import '@awesome.me/webawesome/dist/components/tab/tab.js';
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import type {WaTabShowEvent} from '@awesome.me/webawesome/dist/events/tab-show.js';
import './badge.js';
import './icon.js';

export interface SegmentedTabItem {
  id: string;
  label: string;
  /** An icon name, from the set icons.ts registers. */
  icon?: string;
  /** A count pill after the label; hidden when absent or zero. */
  badge?: number;
  /** A warning-count pill after `badge`; hidden when absent or zero. */
  warnings?: number;
}

/**
 * A row of tabs over a Web Awesome `wa-tab-group`, with the panels left out:
 * callers keep their views mounted and toggle them themselves, so this only
 * picks. The DevTools panel's header tabs (src/panel/segmented-tabs.ts,
 * which moves onto this one with the rest of the panel).
 *
 * Fires `change` with `detail.value` when the user picks a tab; setting
 * `value` from outside moves the selection without firing it.
 */
export class LitSegmentedTabs extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-self: stretch;
    }
    wa-tab-group {
      --indicator-color: var(--wa-color-brand-fill-loud);
      --track-color: transparent;
      --track-width: 2px;
      height: 100%;
    }
    wa-tab-group::part(base),
    wa-tab-group::part(tabs) {
      height: 100%;
    }
    wa-tab-group::part(nav) {
      display: flex;
      height: 100%;
    }
    /* WA underlines the active tab with a border set only on [active], which
       raises its label above its siblings'. Every tab carries the border,
       transparent unless active, so the boxes stay identical. */
    wa-tab {
      height: 100%;
      border-block-end: solid var(--safe-track-width) transparent;
      margin-block-end: calc(-1 * var(--safe-track-width));
    }
    wa-tab[active] {
      border-block-end-color: var(--indicator-color);
    }
    wa-tab-group::part(body) {
      display: none;
    }
    wa-tab::part(base) {
      height: 100%;
      gap: var(--wa-space-2xs);
      padding-block: 0;
      padding-inline: var(--wa-space-s);
      font-size: var(--wa-font-size-m);
      white-space: nowrap;
    }
    :host([size='sm']) wa-tab::part(base) {
      padding-inline: var(--wa-space-xs);
      font-size: var(--wa-font-size-s);
    }
    lit-icon {
      font-size: 1.15em;
    }
    /* WA spaces a slotted wa-icon from the label; the same for lit-icon. */
    wa-tab > lit-icon:first-child {
      margin-inline-end: 0.5em;
    }
    wa-tab > lit-icon:last-child {
      margin-inline-start: 0.5em;
    }
  `;

  @property({type: Array}) items: SegmentedTabItem[] = [];
  @property() value = '';
  @property({reflect: true}) size: 'sm' | 'md' = 'md';

  private _onTabShow(e: WaTabShowEvent) {
    // The group also announces selections made through `value`; only a pick
    // that differs from it is the user's.
    e.stopPropagation();
    const id = e.detail.name;
    if (id === this.value) return;
    this.value = id;
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: {value: id},
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    return html`<wa-tab-group
      .active=${this.value}
      @wa-tab-show=${this._onTabShow}
    >
      ${this.items.map(
        (item) => html`<wa-tab slot="nav" panel=${item.id}>
          ${item.icon ? html`<lit-icon name=${item.icon}></lit-icon>` : nothing}
          ${item.label}
          ${
            item.badge
              ? html`<lit-badge variant="danger" appearance="accent" pill
                  >${item.badge}</lit-badge
                >`
              : nothing
          }
          ${
            item.warnings
              ? html`<lit-badge variant="warning" appearance="accent" pill
                  >${item.warnings}</lit-badge
                >`
              : nothing
          }
        </wa-tab>`
      )}
    </wa-tab-group>`;
  }
}

customElements.define('lit-segmented-tabs', LitSegmentedTabs);

declare global {
  interface HTMLElementTagNameMap {
    'lit-segmented-tabs': LitSegmentedTabs;
  }
}
