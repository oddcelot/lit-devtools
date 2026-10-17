import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';

/**
 * Rendered with `defer-hydration`, so it stays server HTML until the
 * attribute is removed: the button in the page does that. Until then its
 * plant hangs wilted; the `hydrated` attribute, set once hydration has run,
 * waters it and the plant straightens up. All of it in CSS, so the server's
 * HTML already shows the wilted plant and nothing renders twice.
 */
@customElement('ssr-deferred')
export class SsrDeferred extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border: 1px solid color-mix(in oklch, currentColor 25%, transparent);
      border-radius: 0.5rem;
      --grow: 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.45s;
    }
    svg {
      width: 7.5rem;
      flex: none;
      overflow: visible;
    }

    /* Wilted: the server's HTML, and the element until it hydrates. */
    .stem {
      transform-origin: 60px 100px;
      transform: rotate(12deg);
    }
    .head {
      transform-origin: 60px 64px;
      transform: rotate(105deg);
    }
    .leaf-l {
      transform-origin: 60px 82px;
      transform: rotate(-40deg);
    }
    .leaf-r {
      transform-origin: 60px 70px;
      transform: rotate(40deg);
    }
    .bloom {
      transform-origin: 60px 34px;
      transform: scale(0.35);
    }
    .green {
      fill: #a8955f;
      stroke: #a8955f;
    }
    .petal {
      fill: #b9a586;
    }
    .drop {
      fill: #5aa9e6;
      opacity: 0;
    }
    .stem,
    .head,
    .leaf-l,
    .leaf-r,
    .bloom,
    .green,
    .petal {
      transition:
        transform var(--grow),
        fill var(--grow),
        stroke var(--grow);
    }

    /* Hydrated: watered, so it comes alive. */
    :host([hydrated]) :is(.stem, .head, .leaf-l, .leaf-r, .bloom) {
      transform: none;
    }
    :host([hydrated]) .green {
      fill: #3f9d4a;
      stroke: #3f9d4a;
    }
    :host([hydrated]) .petal {
      fill: #e2557a;
    }
    :host([hydrated]) .drop {
      animation: fall 0.5s ease-in both;
    }
    :host([hydrated]) .drop:nth-of-type(2) {
      animation-delay: 0.12s;
    }
    :host([hydrated]) .drop:nth-of-type(3) {
      animation-delay: 0.24s;
    }
    @keyframes fall {
      from {
        opacity: 1;
        transform: translateY(-24px);
      }
      to {
        opacity: 0;
        transform: translateY(40px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
        animation: none !important;
      }
    }
  `;

  @state() private clicks = 0;

  override firstUpdated() {
    // Runs only in the browser, once hydration has run: waters the plant.
    this.setAttribute('hydrated', '');
  }

  override render() {
    return html`
      <svg viewBox="0 0 120 140" aria-hidden="true">
        <g class="drops">
          <path class="drop" d="M48 30 q-4 6 0 8 q4 -2 0 -8z" />
          <path class="drop" d="M62 22 q-4 6 0 8 q4 -2 0 -8z" />
          <path class="drop" d="M74 32 q-4 6 0 8 q4 -2 0 -8z" />
        </g>
        <g class="stem">
          <path
            class="green"
            d="M60 100 C60 88 59 76 60 64"
            stroke-width="3"
            fill="none"
            stroke-linecap="round"
          />
          <path
            class="green leaf-l"
            d="M60 82 C52 72 40 70 32 74 C38 84 52 86 60 82Z"
          />
          <path
            class="green leaf-r"
            d="M60 70 C68 60 80 58 88 62 C82 72 68 74 60 70Z"
          />
          <g class="head">
            <path
              class="green"
              d="M60 64 C61 54 60 46 60 38"
              stroke-width="3"
              fill="none"
              stroke-linecap="round"
            />
            <g class="bloom">
              ${[0, 72, 144, 216, 288].map(
                (angle) => html`
                  <ellipse
                    class="petal"
                    cx="60"
                    cy="24"
                    rx="6"
                    ry="10"
                    transform="rotate(${angle} 60 34)"
                  />
                `
              )}
              <circle cx="60" cy="34" r="5" fill="#f2b632" />
            </g>
          </g>
        </g>
        <ellipse cx="60" cy="101" rx="22" ry="3" fill="#6b4a2f" />
        <rect x="34" y="98" width="52" height="10" rx="2" fill="#c0643c" />
        <path d="M38 108 h44 l-6 28 h-32z" fill="#a8532f" />
      </svg>
      <div>
        <h2>Deferred</h2>
        <button id="poke" @click=${() => this.clicks++}>
          Clicks: ${this.clicks}
        </button>
      </div>
    `;
  }
}
