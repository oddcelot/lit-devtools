import {LitElement, css, html, nothing} from 'lit';
import {api} from '@oddsquad/pyrelia/eden';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';

/**
 * Listens to the API's feed, server-sent events from a generator route,
 * through the typed Eden client: each event's `data` is typed from what
 * the route yields. It listens while it is on the page, and stops when it
 * leaves, which ends the generator on the server too.
 */
export class NoteFeed extends LitElement {
  static override properties = {
    arrived: {state: true},
    listening: {state: true},
  };
  // Web Awesome's utility classes are page CSS, which stops at the shadow root.
  static override styles = css`
    :host {
      display: block;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--wa-space-s);
    }
  `;

  arrived: string[] = [];
  listening = false;
  #controller?: AbortController;

  override connectedCallback() {
    super.connectedCallback();
    this.#controller = new AbortController();
    void this.listen(this.#controller.signal);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller?.abort();
  }

  async listen(signal: AbortSignal) {
    const {data, error} = await api.api.notes.feed.get({fetch: {signal}});
    if (error || !data) return;
    try {
      for await (const chunk of data) {
        if (chunk.event === 'ready') this.listening = true;
        if (chunk.event === 'note') {
          this.arrived = [...this.arrived, chunk.data.title];
        }
      }
    } catch (thrown) {
      if (!signal.aborted) throw thrown;
    } finally {
      this.listening = false;
    }
  }

  /** Adds a note through the API, which the feed then announces. */
  async add() {
    await api.api.notes.post({
      title: `Live ${new Date().toISOString().slice(11, 19)}`,
      body: 'Announced by the feed.',
    });
  }

  override render() {
    return html`
      <div class="actions">
        <wa-badge
          id="feed-state"
          variant=${this.listening ? 'success' : 'neutral'}
          >${this.listening ? 'Listening' : 'Connecting'}</wa-badge
        >
        <wa-button id="feed-add" variant="brand" @click=${() => this.add()}>
          Add a note through the API
        </wa-button>
      </div>
      ${
        this.arrived.length
          ? html`<ol id="feed">
              ${this.arrived.map((title) => html`<li>${title}</li>`)}
            </ol>`
          : nothing
      }
    `;
  }
}
customElements.define('note-feed', NoteFeed);

declare global {
  interface HTMLElementTagNameMap {
    'note-feed': NoteFeed;
  }
}
