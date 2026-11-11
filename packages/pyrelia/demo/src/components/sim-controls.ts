import {LitElement, css, html} from 'lit';
import {configurePending, invalidate} from '@oddsquad/pyrelia/routes';
import {
  LATENCY_COOKIE,
  PENDING_MIN_MS_COOKIE,
  PENDING_MS_COOKIE,
  SPEEDS,
} from '../latency.ts';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/slider/slider.js';

const remember = (name: string, value: number) => {
  document.cookie = `${name}=${value}; path=/; samesite=lax`;
};

const CHOSEN = {variant: 'brand', appearance: 'accent', pressed: 'true'};
const OTHER = {variant: 'neutral', appearance: 'outlined', pressed: 'false'};

/**
 * Simulates a slower world, as TanStack Router's kitchen sink does: latency
 * the server adds to every page request, and the router's pending settings.
 * All three live in cookies, so the server renders what the browser uses.
 */
export class SimControls extends LitElement {
  static override properties = {
    latency: {type: Number},
    pendingMs: {type: Number, attribute: 'pending-ms'},
    pendingMinMs: {type: Number, attribute: 'pending-min-ms'},
  };
  static override styles = css`
    /* Stuck to the bottom of the menu while it scrolls, which passes under
       it: a surface of its own, so the menu doesn't show through. */
    :host {
      display: block;
      position: sticky;
      bottom: 0;
      z-index: 1;
      padding: var(--wa-space-s) var(--wa-space-m) var(--wa-space-m);
      border-top: var(--wa-border-width-s) solid var(--wa-color-surface-border);
      background: var(--wa-color-surface-default);
    }
    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: var(--wa-space-xs);
    }
    h2 {
      margin: 0;
      font-size: var(--wa-font-size-2xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--wa-color-text-quiet);
    }
    .keys {
      margin: 0;
      font-size: var(--wa-font-size-2xs);
      color: var(--wa-color-text-quiet);
    }
    kbd {
      font-family: var(--wa-font-family-code);
      padding: 0 0.3em;
      border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
      border-radius: var(--wa-border-radius-s);
    }
    /* Two by two: four in a row don't fit the sidebar. */
    #latency {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--wa-space-2xs);
    }
    wa-slider {
      margin-top: var(--wa-space-s);
    }
    /* From the server, wa-slider always has a row for reference labels: it
       can't tell they aren't slotted, as it can for its label and hint
       with with-label and with-hint. Upgraded, it drops the row, and the
       panel shrank 14px. Hidden until then. */
    wa-slider:not(:defined)::part(references) {
      display: none;
    }
  `;

  latency = 0;
  pendingMs = 150;
  pendingMinMs = 300;

  /**
   * Tells wa-page how tall the panel is, as `--simulate-height`: the menu
   * keeps that much clear when it scrolls a link into view, so focus never
   * lands behind the panel. Made when connected: the server, which
   * renders the panel too, has no ResizeObserver.
   */
  #size: ResizeObserver | undefined;

  override connectedCallback() {
    super.connectedCallback();
    this.#size = new ResizeObserver(([entry]) => {
      const height = entry!.borderBoxSize[0]!.blockSize;
      this.closest('wa-page')?.style.setProperty(
        '--simulate-height',
        `${height}px`
      );
    });
    this.#size.observe(this);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#size?.disconnect();
  }

  // In the browser only: the server has nothing to configure.
  override updated() {
    configurePending({ms: this.pendingMs, minMs: this.pendingMinMs});
  }

  #latency(ms: number) {
    remember(LATENCY_COOKIE, ms);
    this.latency = ms;
    // The page on screen loads again, which already takes as long.
    void invalidate();
  }

  #slider(cookie: string, key: 'pendingMs' | 'pendingMinMs') {
    return (event: Event) => {
      const value = Number((event.target as HTMLInputElement).value);
      remember(cookie, value);
      this[key] = value;
    };
  }

  override render() {
    return html`
      <header>
        <h2>Simulate</h2>
        <p class="keys"><kbd>J</kbd> <kbd>K</kbd> step through the menu</p>
      </header>
      <div role="group" aria-label="Simulated latency" id="latency">
        ${SPEEDS.map(({label, ms}) => {
          const look = ms === this.latency ? CHOSEN : OTHER;
          return html`<wa-button
            size="s"
            variant=${look.variant}
            appearance=${look.appearance}
            aria-pressed=${look.pressed}
            @click=${() => this.#latency(ms)}
            >${label}</wa-button
          >`;
        })}
      </div>
      <wa-slider
        id="pending-ms"
        label="pendingMs: ${this.pendingMs} ms"
        size="s"
        min="0"
        max="5000"
        step="100"
        value=${this.pendingMs}
        @input=${this.#slider(PENDING_MS_COOKIE, 'pendingMs')}
      ></wa-slider>
      <wa-slider
        id="pending-min-ms"
        label="pendingMinMs: ${this.pendingMinMs} ms"
        size="s"
        min="0"
        max="5000"
        step="100"
        value=${this.pendingMinMs}
        @input=${this.#slider(PENDING_MIN_MS_COOKIE, 'pendingMinMs')}
      ></wa-slider>
    `;
  }
}
customElements.define('sim-controls', SimControls);

declare global {
  interface HTMLElementTagNameMap {
    'sim-controls': SimControls;
  }
}
