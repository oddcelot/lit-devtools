import {LitElement, css, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/** A card with a `title` slot, a `meta` line, and the rest as its body. */
@customElement('media-card')
export class MediaCard extends LitElement {
  static override styles = [
    ui,
    css`
      header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-6);
        margin-bottom: var(--space-5);
        padding-bottom: var(--space-5);
        border-bottom: 1px solid var(--border-subtle);
      }
      ::slotted([slot='title']) {
        margin: 0;
        color: var(--text-strong);
        font-size: var(--text-lg);
      }
      ::slotted([slot='meta']) {
        color: var(--text-muted);
        font-size: var(--text-sm);
      }
      .body {
        color: var(--text-secondary);
      }
    `,
  ];

  override render() {
    return html`
      <header>
        <slot name="title"></slot>
        <slot name="meta"></slot>
      </header>
      <div class="body"><slot></slot></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'media-card': MediaCard;
  }
}
