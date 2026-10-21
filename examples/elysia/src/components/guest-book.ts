import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import type {Entry} from '../shared.ts';
import './guest-entry.ts';

/** The signatures, newest first. */
@customElement('guest-book')
export class GuestBook extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    h2 {
      margin: 0 0 1rem;
      font: 600 1.25rem var(--serif);
    }
    h2 span {
      color: var(--muted);
      font: 400 0.9rem var(--sans);
    }
    ol {
      display: grid;
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .empty {
      color: var(--muted);
      font-style: italic;
    }
  `;

  @property({attribute: false}) entries: Entry[] = [];
  @property({attribute: false}) now?: number;
  /** Ids of entries that arrived live, to animate in. */
  @property({attribute: false}) fresh: readonly number[] = [];

  override render() {
    const {entries} = this;
    const count =
      entries.length === 1 ? '1 so far' : `${entries.length} so far`;
    return html`
      <h2>Signatures <span>${count}</span></h2>
      ${
        entries.length === 0
          ? html`<p class="empty">Nobody has signed yet. Be the first.</p>`
          : html`<ol>
              ${repeat(
                entries,
                (entry) => entry.id,
                (entry) =>
                  html`<li>
                    <guest-entry
                      .entry=${entry}
                      .now=${this.now}
                      ?fresh=${this.fresh.includes(entry.id)}
                    ></guest-entry>
                  </li>`
              )}
            </ol>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'guest-book': GuestBook;
  }
}
