import {LitElement, css, html, nothing} from 'lit';
import {api} from '@oddsquad/lit-elysia/eden';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';

/**
 * Asks the API who the visitor is. Its route takes the `auth` macro, so
 * the answer is a name, typed as a string, or a 401 with a typed body.
 */
export class WhoAmI extends LitElement {
  static override properties = {
    answer: {state: true},
    refused: {state: true},
  };
  static override styles = css`
    :host {
      display: block;
    }
    wa-callout {
      margin-top: var(--wa-space-m);
    }
  `;

  answer?: string;
  refused = false;

  async ask() {
    const {data, error} = await api.api.me.get();
    this.refused = error?.status === 401;
    if (error?.status === 401) this.answer = `401: ${error.value.message}`;
    else if (error) this.answer = `The API said ${String(error.status)}`;
    else this.answer = `The API knows you as ${data.name}.`;
  }

  override render() {
    return html`
      <wa-button id="ask" variant="brand" @click=${() => this.ask()}>
        Ask /api/me
      </wa-button>
      ${
        this.answer
          ? html`<wa-callout
              id="answer"
              role="status"
              variant=${this.refused ? 'warning' : 'success'}
              >${this.answer}</wa-callout
            >`
          : nothing
      }
    `;
  }
}
customElements.define('who-am-i', WhoAmI);

declare global {
  interface HTMLElementTagNameMap {
    'who-am-i': WhoAmI;
  }
}
