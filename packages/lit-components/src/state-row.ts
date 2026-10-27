import {LitElement, css, html, nothing} from 'lit';
import {property} from 'lit/decorators.js';
import './badge.js';
import './icon.js';

/**
 * One `name: value` line of a state inspector, its value coloured by `type`
 * with the design system's code colours. An `expandable` row toggles its
 * children: nested `lit-state-row`s in the default slot, indented by
 * `depth`. Clicking the caret fires `toggle` with `detail.expanded`.
 */
export class LitStateRow extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      line-height: 22px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-inline-start: calc(var(--depth, 0) * var(--space-6));
      border-radius: var(--radius-xs);
    }
    .row:hover {
      background: var(--surface-hover);
    }
    button {
      display: inline-grid;
      place-items: center;
      width: 16px;
      height: 16px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--text-muted);
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--focus-ring);
      border-radius: var(--radius-xs);
    }
    .spacer {
      width: 16px;
    }
    .name {
      color: var(--code-property);
    }
    .colon {
      color: var(--text-muted);
    }
    .value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--code-default);
    }
    :host([type='string']) .value {
      color: var(--code-string);
    }
    :host([type='number']) .value {
      color: var(--code-number);
    }
    :host([type='boolean']) .value {
      color: var(--code-keyword);
    }
    :host([type='ref']) .value {
      color: var(--code-tag);
    }
    :host([type='function']) .value {
      color: var(--code-callee);
    }
    :host([type='null']) .value {
      color: var(--code-comment);
    }
    lit-badge {
      font-family: var(--font-sans);
    }
    .children {
      display: none;
    }
    :host([expanded]) .children {
      display: block;
    }
  `;

  @property() name = '';
  @property() value = '';
  @property({reflect: true}) type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'ref'
    | 'object'
    | 'function'
    | 'null' = 'object';
  @property({type: Number}) depth = 0;
  @property({type: Boolean}) expandable = false;
  @property({type: Boolean, reflect: true}) expanded = false;
  /** A tag after the value, such as `Reactive`. */
  @property() badge = '';

  private _toggle() {
    this.expanded = !this.expanded;
    this.dispatchEvent(
      new CustomEvent('toggle', {
        detail: {expanded: this.expanded},
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    return html`<div class="row" part="row" style="--depth: ${this.depth}">
        ${
          this.expandable
            ? html`<button
                aria-expanded=${this.expanded ? 'true' : 'false'}
                aria-label=${`${this.expanded ? 'Collapse' : 'Expand'} ${this.name}`}
                @click=${this._toggle}
              >
                <lit-icon
                  name=${this.expanded ? 'caret-down' : 'caret-right'}
                ></lit-icon>
              </button>`
            : html`<span class="spacer"></span>`
        }
        <span part="name"
          ><span class="name">${this.name}</span
          ><span class="colon">:</span></span
        >
        <span class="value" part="value">${this.value}</span>
        ${
          this.badge === ''
            ? nothing
            : html`<lit-badge variant="brand">${this.badge}</lit-badge>`
        }
      </div>
      <div class="children" part="children"><slot></slot></div>`;
  }
}

customElements.define('lit-state-row', LitStateRow);

/** What a row's value is, which picks its colour. */
export type StateRowType = LitStateRow['type'];

declare global {
  interface HTMLElementTagNameMap {
    'lit-state-row': LitStateRow;
  }
}
