import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

/**
 * Takes its tags as an array property, which no attribute can carry, and a
 * heading through its `title` slot. The renderer sends the array along so
 * the element hydrates with it, as a plain tag or as an island.
 */
@customElement('tag-list')
export class TagList extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 1rem;
      border: 1px solid color-mix(in oklch, currentColor 25%, transparent);
      border-radius: 0.5rem;
    }
    ul {
      display: flex;
      gap: 0.5rem;
      padding: 0;
      list-style: none;
    }
    li {
      padding: 0.1rem 0.5rem;
      border-radius: 1rem;
      background: color-mix(in oklch, currentColor 10%, transparent);
    }
  `;

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
