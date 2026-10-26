import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/**
 * Takes its tags as an array property, which no attribute can carry, and a
 * heading through its `title` slot. The renderer sends the array along so
 * the element hydrates with it, as a plain tag or as an island.
 */
@customElement('tag-list')
export class TagList extends LitElement {
  static override styles = [
    ui,
    css`
      ul {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-4);
        margin: 0 0 var(--space-6);
        padding: 0;
        list-style: none;
      }
      li {
        padding: var(--space-1) var(--space-5);
        border-radius: var(--radius-pill);
        background: var(--accent-soft);
        color: var(--text-strong);
        font: var(--weight-semibold) var(--text-sm) var(--font-mono);
      }
    `,
  ];

  @property({attribute: false}) tags: string[] = [];

  override render() {
    return html`
      <slot name="title"></slot>
      <ul>
        ${this.tags.map((tag) => html`<li>${tag}</li>`)}
      </ul>
      <button
        id="add"
        @click=${() => (this.tags = [...this.tags, `#${this.tags.length + 1}`])}
      >
        Add a tag
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tag-list': TagList;
  }
}
