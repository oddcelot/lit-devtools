import {LitElement, html, css, nothing} from 'lit';
import type {TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import '../../packages/lit-components/src/button.js';
import './wa-icons.js';
import {tokens} from '../lib/tokens.js';
import '../../packages/lit-components/src/icon.js';

export interface LayerState {
  id: string;
  label: string;
  color: number;
  enabled: boolean;
}

/** A layer's `0xRRGGBB` colour as a CSS hex string. */
const hexColor = (color: number): string =>
  '#' + color.toString(16).padStart(6, '0');

/** CSS colour of layer `id`, grey for a layer `layers` does not know. */
export const layerColor = (
  layers: readonly LayerState[],
  id: string
): string => {
  const layer = layers.find((l) => l.id === id);
  return layer ? hexColor(layer.color) : '#888';
};

/** Styles for {@link renderEmptyState}; the list and the tracks both adopt them. */
export const emptyStateStyles = css`
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    box-sizing: border-box;
    height: 100%;
    gap: var(--lit-devtools-space-3);
    padding: var(--lit-devtools-space-5);
    text-align: center;
    font-family: var(--lit-devtools-font-sans);
    font-size: var(--lit-devtools-text-xs);
    color: var(--lit-devtools-text-muted);
  }
  .empty .hint {
    font-size: var(--lit-devtools-text-2xs);
    color: var(--lit-devtools-text-muted);
  }
  .empty lit-button {
    margin-top: var(--lit-devtools-space-3);
  }
  .empty lit-button::part(base) {
    height: var(--lit-devtools-control-height, 28px);
  }
`;

/**
 * The Timeline's empty state, shared by List and Tracks. The Record button is
 * only offered when `onRecord` is given (the host can record and is not
 * already); the presentations forward its click as `record-request`.
 */
export const renderEmptyState = (onRecord?: () => void): TemplateResult =>
  html`<div class="empty">
    <span>No events yet</span>
    <span class="hint"
      >Interact with the page, or press Record to capture a session.</span
    >
    ${
      onRecord
        ? html`<lit-button
            variant="neutral"
            size="s"
            appearance="outlined"
            @click=${onRecord}
          >
            <lit-icon slot="start" name="record"></lit-icon>
            Start recording
          </lit-button>`
        : nothing
    }
  </div>`;

/**
 * Strip of colored toggle chips, one per timeline layer. On is a solid swatch
 * and normal text over a faint fill; off is a hollow swatch, muted text and no
 * fill. Each chip is a button with `aria-pressed`.
 *
 * `timeline-view` shows it as `menu`, in its Layers popover: a row per
 * layer, with a second toggle in Tracks mode for whether the layer gets a
 * track, so one control holds both choices.
 */
@customElement('timeline-layers')
export class TimelineLayers extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-2);
        padding: var(--lit-devtools-space-3) var(--lit-devtools-space-5);
        border-bottom: 1px solid var(--lit-devtools-border);
        background: var(--lit-devtools-surface-low);
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      .chip {
        --layer: #888;
        display: inline-flex;
        align-items: center;
        gap: var(--lit-devtools-space-3);
        box-sizing: border-box;
        height: var(--lit-devtools-control-height, 28px);
        padding: 0 var(--lit-devtools-space-4);
        border: 1px solid var(--lit-devtools-border);
        border-radius: var(--lit-devtools-radius-pill, 999px);
        background: var(--lit-devtools-surface-container-high);
        color: var(--lit-devtools-text);
        font: inherit;
        font-size: var(--lit-devtools-text-xs);
        white-space: nowrap;
        cursor: pointer;
      }
      .chip:hover {
        border-color: var(--lit-devtools-border-strong);
      }
      .chip:focus-visible {
        outline: 2px solid var(--lit-devtools-focus-ring);
        outline-offset: 1px;
      }
      .chip[aria-pressed='false'] {
        background: transparent;
        color: var(--lit-devtools-text-muted);
      }
      .dot {
        width: 8px;
        height: 8px;
        box-sizing: border-box;
        flex-shrink: 0;
        background: var(--layer);
        border: 1px solid var(--layer);
      }
      .chip[aria-pressed='false'] .dot {
        background: transparent;
      }
      /* In the Layers popover: one row per layer, square like a menu, with
         the track toggle beside it in Tracks mode. */
      :host([menu]) {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0;
        min-width: 15rem;
        padding: 0;
        border: 0;
        background: none;
      }
      .heading {
        padding: var(--lit-devtools-space-2) var(--lit-devtools-space-4);
        color: var(--lit-devtools-text-muted);
        font-size: var(--lit-devtools-text-2xs);
      }
      .heading.end {
        text-align: end;
      }
      :host([menu]) .chip {
        justify-content: flex-start;
        border: 0;
        border-radius: 0;
        background: transparent;
      }
      :host([menu]) .chip:hover,
      .track:hover {
        background: var(--lit-devtools-surface-hover);
      }
      :host([menu]) .chip:focus-visible,
      .track:focus-visible {
        outline: 2px solid var(--lit-devtools-focus-ring);
        outline-offset: -2px;
      }
      .track {
        box-sizing: border-box;
        height: var(--lit-devtools-control-height, 28px);
        padding: 0 var(--lit-devtools-space-4);
        border: 0;
        background: transparent;
        color: var(--lit-devtools-text-muted);
        font: inherit;
        font-size: var(--lit-devtools-text-2xs);
        cursor: pointer;
      }
      .track[aria-pressed='true'] {
        color: var(--lit-devtools-text);
      }
      .track:disabled {
        visibility: hidden;
      }
    `,
  ];

  @property({type: Array}) layers: LayerState[] = [];
  /** One row per layer, for the Layers popover. */
  @property({type: Boolean, reflect: true}) menu = false;
  /**
   * In `menu` mode, a track toggle per row: the layers that can have a
   * track, and those hidden from the tracks. Null leaves the toggles out
   * (the List view has no tracks).
   */
  @property({attribute: false}) tracks: {
    trackable: ReadonlySet<string>;
    hidden: ReadonlySet<string>;
  } | null = null;

  private _toggleTrack(id: string) {
    this.dispatchEvent(
      new CustomEvent<{id: string}>('track-toggle', {
        detail: {id},
        bubbles: true,
        composed: true,
      })
    );
  }

  /** The chip a layer gets, in a strip or a menu row. */
  private _chip(l: LayerState) {
    return html`<button
      type="button"
      class="chip ${l.enabled ? 'on' : ''}"
      aria-pressed=${l.enabled ? 'true' : 'false'}
      data-tip=${l.enabled ? `Hide ${l.label}` : `Show ${l.label}`}
      @click=${() => this._toggle(l.id)}
    >
      <span class="dot" style=${'--layer:' + hexColor(l.color)}></span>
      ${l.label}
    </button>`;
  }

  private _renderMenu() {
    const tracks = this.tracks;
    return html`<span class="heading">Record</span
      ><span class="heading end">${tracks ? 'Track' : nothing}</span>
      ${this.layers.map((l) => {
        const trackable =
          tracks !== null && l.enabled && tracks.trackable.has(l.id);
        const shown = trackable && !tracks.hidden.has(l.id);
        return html`${this._chip(l)}${
          tracks === null
            ? html`<span></span>`
            : html`<button
                type="button"
                class="track"
                aria-pressed=${shown ? 'true' : 'false'}
                aria-label="${l.label} as a track"
                ?disabled=${!trackable}
                @click=${() => this._toggleTrack(l.id)}
              >
                ${shown ? 'shown' : 'hidden'}
              </button>`
        }`;
      })}`;
  }

  private _toggle(id: string) {
    this.dispatchEvent(
      new CustomEvent<{id: string}>('layer-toggle', {
        detail: {id},
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    if (this.menu) return this._renderMenu();
    return html`${this.layers.map((l) => this._chip(l))}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'timeline-layers': TimelineLayers;
  }
}
