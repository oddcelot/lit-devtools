import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import './x-button.js';
import './x-card.js';
import '../../vendor/legacy-ui/legacy-chip.js';

/**
 * The page: every component used the way it should be, so nothing here is
 * reported. Type a `<` or a space inside a tag in the template below and
 * the editor offers the tags, attributes, properties and events each one
 * takes.
 */
@customElement('checks-app')
export class ChecksApp extends LitElement {
  static styles = css`
    :host {
      display: grid;
      gap: 1rem;
      max-width: 32rem;
      margin: 3rem auto;
      padding: 0 1rem;
    }
  `;

  @state() private pressed = 0;
  @state() private size: 'small' | 'large' = 'small';

  render() {
    return html`
      <x-card raised>
        <h1 slot="header">Checks</h1>
        <p>
          Nothing on this page is reported. Open the files in
          <code>src/mistakes/</code> to see what is.
        </p>
        <!-- From vendor/legacy-ui, known through its hand-written manifest. -->
        <legacy-chip tone="warm">${this.pressed} presses</legacy-chip>
        <x-button slot="footer" .size=${this.size} @press=${this.#onPress}>
          Press
        </x-button>
      </x-card>
    `;
  }

  #onPress(e: CustomEvent<{size: 'small' | 'large'}>) {
    this.pressed++;
    this.size = e.detail.size === 'small' ? 'large' : 'small';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'checks-app': ChecksApp;
  }
}
