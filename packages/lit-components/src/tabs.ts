import {LitElement, css, html, nothing} from 'lit';
import {property} from 'lit/decorators.js';
import '@awesome.me/webawesome/dist/components/tab/tab.js';
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import type {WaTabShowEvent} from '@awesome.me/webawesome/dist/events/tab-show.js';
import './badge.js';
import './icon.js';

export interface TabItem {
  id: string;
  label: string;
  /** An icon name, from the set icons.ts registers. */
  icon?: string;
  /** A count pill after the label, in brand blue (news, not a fault);
   * hidden when absent or zero. */
  badge?: number;
  /** A warning-count pill after `badge`; hidden when absent or zero. */
  warnings?: number;
}

/**
 * A row of tabs over a Web Awesome `wa-tab-group`, with the panels left out:
 * callers keep their views mounted and toggle them themselves, so this only
 * picks; the DevTools panel's header tabs use it. Underline tabs, not a segmented
 * control: the active tab is marked by the brand-coloured indicator.
 *
 * Fires `change` with `detail.value` when the user picks a tab; setting
 * `value` from outside moves the selection without firing it.
 */
export class LitTabs extends LitElement {
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
    /* Too narrow for the labels: icons alone, the label kept for assistive
       tech (and shown as the tab's tooltip). */
    :host([compact]) wa-tab > lit-icon:first-child {
      margin-inline-end: 0;
    }
    :host([compact]) .label.hideable {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `;

  @property({type: Array}) items: TabItem[] = [];
  @property() value = '';
  @property({reflect: true}) size: 'sm' | 'md' = 'md';
  /**
   * Set by the element itself when its labelled tabs don't fit its width:
   * tabs with an icon then show only the icon. Style hook; not an input.
   */
  @property({type: Boolean, reflect: true}) compact = false;

  /** The tabs' width with their labels showing, last measured. */
  private _labelledWidth = 0;
  private readonly _resize =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this._fit());

  override connectedCallback() {
    super.connectedCallback();
    this._resize?.observe(this);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._resize?.disconnect();
  }

  protected override updated() {
    // The tabs too: a badge appearing, or a tab finishing its first render,
    // changes the labelled width without changing ours.
    for (const tab of this.shadowRoot?.querySelectorAll('wa-tab') ?? []) {
      this._resize?.observe(tab);
    }
    this._fit();
  }

  /**
   * Labels while they fit, icons when they don't. The labelled width is
   * measured only while the labels show, so the switch back happens at the
   * same width as the switch away and the two never fight.
   */
  private _fit() {
    // Fractional, like the tabs' widths: a host sized to its tabs must
    // not read as a pixel short of them.
    const width = this.getBoundingClientRect().width;
    if (width === 0) return;
    if (!this.compact) {
      this._labelledWidth = [
        ...(this.shadowRoot?.querySelectorAll('wa-tab') ?? []),
      ].reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0);
    }
    const compact = width + 0.5 < this._labelledWidth;
    if (compact !== this.compact) this.compact = compact;
  }

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
        (item) => html`<wa-tab
          slot="nav"
          panel=${item.id}
          data-tip=${this.compact && item.icon ? item.label : nothing}
        >
          ${item.icon ? html`<lit-icon name=${item.icon}></lit-icon>` : nothing}
          <span class="label ${item.icon ? 'hideable' : ''}"
            >${item.label}</span
          >
          ${
            item.badge
              ? html`<lit-badge variant="brand" appearance="accent" pill
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

customElements.define('lit-tabs', LitTabs);

declare global {
  interface HTMLElementTagNameMap {
    'lit-tabs': LitTabs;
  }
}
