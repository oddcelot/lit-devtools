import {LitElement, css, html, nothing} from 'lit';
import {property} from 'lit/decorators.js';
import './badge.js';
import './icon.js';

/**
 * One row of a custom-element tree: `<tag>`, indented by `depth`, with its
 * children (nested `lit-tree-node`s) in the default slot. Clicking the row
 * fires `select` (and sets `selected`); the caret of an `expandable` row
 * fires `toggle` with `detail.expanded`. For a handful of rows: the panel's
 * own tree is virtualized and keeps its own rows.
 */
export class LitTreeNode extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      /* The row token, as the panel's own tree: a 24px target. */
      line-height: var(--row-height);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-inline: calc(var(--depth, 0) * var(--space-6) + var(--space-2))
        var(--space-4);
      color: var(--text);
      cursor: pointer;
    }
    .row:hover {
      background: var(--surface-hover);
    }
    :host([selected]) .row {
      background: var(--accent-soft);
      box-shadow: inset 2px 0 0 var(--accent);
    }
    .row:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
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
    .spacer {
      width: 16px;
    }
    .bracket {
      color: var(--text-muted);
    }
    .tag {
      color: var(--code-tag);
    }
    lit-badge {
      margin-inline-start: auto;
      font-family: var(--font-sans);
    }
    .children {
      display: none;
    }
    :host([expanded]) .children {
      display: block;
    }
  `;

  @property() tag = '';
  @property({type: Number}) depth = 0;
  @property({type: Boolean}) expandable = false;
  @property({type: Boolean, reflect: true}) expanded = false;
  @property({type: Boolean, reflect: true}) selected = false;
  /** A count or note at the row's end. */
  @property() badge = '';

  private _emit(type: 'select' | 'toggle', detail: object) {
    this.dispatchEvent(
      new CustomEvent(type, {detail, bubbles: true, composed: true})
    );
  }

  private _toggle(e: Event) {
    e.stopPropagation();
    this.expanded = !this.expanded;
    this._emit('toggle', {expanded: this.expanded});
  }

  private _select() {
    this.selected = true;
    this._emit('select', {tag: this.tag});
  }

  override render() {
    return html`<div
        class="row"
        part="row"
        role="treeitem"
        tabindex="0"
        aria-selected=${this.selected ? 'true' : 'false'}
        aria-expanded=${
          this.expandable ? (this.expanded ? 'true' : 'false') : nothing
        }
        style="--depth: ${this.depth}"
        @click=${this._select}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._select();
          }
        }}
      >
        ${
          this.expandable
            ? html`<button
                tabindex="-1"
                aria-label=${`${this.expanded ? 'Collapse' : 'Expand'} ${this.tag}`}
                @click=${this._toggle}
              >
                <lit-icon
                  name=${this.expanded ? 'caret-down' : 'caret-right'}
                ></lit-icon>
              </button>`
            : html`<span class="spacer"></span>`
        }
        <span part="tag"
          ><span class="bracket">&lt;</span><span class="tag">${this.tag}</span
          ><span class="bracket">&gt;</span></span
        >
        ${this.badge === '' ? nothing : html`<lit-badge>${this.badge}</lit-badge>`}
      </div>
      <div class="children" role="group" part="children"><slot></slot></div>`;
  }
}

customElements.define('lit-tree-node', LitTreeNode);

declare global {
  interface HTMLElementTagNameMap {
    'lit-tree-node': LitTreeNode;
  }
}
