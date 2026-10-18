import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/**
 * Rendered with `defer-hydration`, so it stays server HTML until the
 * attribute is removed: the button in the page does that. Until then its
 * plant hangs wilted next to a full glass; the `hydrated` attribute, set
 * once hydration has run, tips the glass out over the soil and the plant
 * straightens up. All of it in CSS, so the server's HTML already shows the
 * wilted plant and nothing renders twice.
 */
@customElement('ssr-deferred')
export class SsrDeferred extends LitElement {
  static override styles = [
    ui,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--space-8);
        /* Once the water reaches the soil. */
        --grow: 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 1s;
      }
      svg {
        width: 8.5rem;
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
      .glass {
        transform-origin: 40px 0;
      }
      .glass-body {
        fill: rgb(255 255 255 / 0.08);
        stroke: rgb(255 255 255 / 0.55);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }
      .water {
        fill: #5aa9e6;
        transform-origin: 29px 30px;
      }
      /* Drawn down from the rim and pulled after it: hidden either side. */
      .stream {
        stroke: #5aa9e6;
        stroke-width: 3;
        stroke-linecap: round;
        stroke-dasharray: 100;
        stroke-dashoffset: 100;
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
      /* Poured: the glass tips over the pot, empties, and stands back up. */
      :host([hydrated]) .glass {
        animation: pour 2s ease-in-out both;
      }
      :host([hydrated]) .water {
        transform: scaleY(0);
        animation: drain 0.9s linear 0.4s both;
      }
      :host([hydrated]) .stream {
        animation: stream 1.1s linear 0.35s both;
      }
      :host([hydrated]) .drop {
        /* forwards, not both: hidden until the stream lands. */
        animation: splash 0.5s ease-out 0.7s forwards;
      }
      :host([hydrated]) .drop:nth-of-type(2) {
        animation-delay: 0.85s;
      }
      :host([hydrated]) .drop:nth-of-type(3) {
        animation-delay: 1s;
      }
      @keyframes pour {
        20%,
        75% {
          transform: rotate(115deg);
        }
      }
      @keyframes drain {
        from {
          transform: scaleY(1);
        }
      }
      @keyframes stream {
        30%,
        75% {
          stroke-dashoffset: 0;
        }
        to {
          stroke-dashoffset: -100;
        }
      }
      @keyframes splash {
        from {
          opacity: 1;
          transform: none;
        }
        to {
          opacity: 0;
          transform: translate(var(--dx), -12px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ];

  @state() private clicks = 0;

  override firstUpdated() {
    // Runs only in the browser, once hydration has run: waters the plant.
    this.setAttribute('hydrated', '');
  }

  override render() {
    return html`
      <svg viewBox="0 -24 120 164" aria-hidden="true">
        <path class="stream" d="M42 2 V98" pathLength="100" />
        <g class="drops">
          <path
            class="drop"
            style="--dx: -6px"
            d="M38 92 q-3 5 0 6 q3 -1 0 -6z"
          />
          <path
            class="drop"
            style="--dx: 0px"
            d="M42 90 q-3 5 0 6 q3 -1 0 -6z"
          />
          <path
            class="drop"
            style="--dx: 6px"
            d="M46 92 q-3 5 0 6 q3 -1 0 -6z"
          />
        </g>
        <g class="glass">
          <path class="water" d="M18.4 5 H39.6 L37 30 H21z" />
          <path class="glass-body" d="M18 0 H40 L37 30 H21z" />
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
