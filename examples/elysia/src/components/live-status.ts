import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

export type Connection = 'connecting' | 'live' | 'offline';

/** Whether the page is connected to `/live`, and how many others are. */
@customElement('live-status')
export class LiveStatus extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.3rem 0.7rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--card);
      font-size: 0.8rem;
      color: var(--muted);
    }
    i {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--muted);
    }
    :host([connection='live']) i {
      background: var(--live);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--live) 20%, transparent);
    }
    :host([connection='offline']) i {
      background: var(--warn);
    }
  `;

  @property({reflect: true}) connection: Connection = 'connecting';
  @property({type: Number}) online = 0;

  override render() {
    const label = {
      connecting: 'Connecting…',
      live: `Live · ${this.online} ${this.online === 1 ? 'reader' : 'readers'}`,
      offline: 'Offline, retrying',
    }[this.connection];
    return html`<i></i>${label}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'live-status': LiveStatus;
  }
}
