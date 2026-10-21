import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type {Entry} from '../shared.ts';

const utc = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const relative = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
];

const ago = (iso: string, now: number) => {
  let value = (Date.parse(iso) - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) {
      return unit === 'second'
        ? 'just now'
        : relative.format(Math.round(value), unit);
    }
    value /= size;
  }
  return utc.format(Date.parse(iso));
};

/**
 * One signature. Its time reads in UTC until the page passes `now`: the
 * server cannot know the reader's clock, and hydration expects the first
 * render in the browser to match the server's HTML, so the switch to "5
 * minutes ago" is a second render the client asks for.
 */
@customElement('guest-entry')
export class GuestEntry extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 1rem 1.25rem;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 0.75rem;
    }
    :host([fresh]) {
      animation: arrive 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    @keyframes arrive {
      from {
        opacity: 0;
        transform: translateY(-0.5rem);
        background: color-mix(in srgb, var(--accent) 8%, var(--card));
      }
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: baseline;
    }
    strong {
      font: 600 1.1rem var(--serif);
    }
    time {
      color: var(--muted);
      font-size: 0.8rem;
      white-space: nowrap;
    }
    p {
      margin: 0.35rem 0 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
  `;

  @property({attribute: false}) entry?: Entry;
  /** The reader's clock; unset on the server and in the first render. */
  @property({attribute: false}) now?: number;
  /** Arrived over `/live` after the page loaded. */
  @property({type: Boolean, reflect: true}) fresh = false;

  override render() {
    const {entry, now} = this;
    if (!entry) return;
    const absolute = `${utc.format(Date.parse(entry.createdAt))} UTC`;
    return html`
      <header>
        <strong>${entry.name}</strong>
        <time datetime=${entry.createdAt} title=${absolute}>
          ${now === undefined ? absolute : ago(entry.createdAt, now)}
        </time>
      </header>
      <p>${entry.message}</p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'guest-entry': GuestEntry;
  }
}
