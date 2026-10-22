/**
 * `<timeline-figure>`: the panel's Timeline tracks, live, over a recording
 * committed next to this file, for pages outside the panel: the docs'
 * Timeline guide and the kitchen sink. Zoom, pan, draw a range and select
 * marks as in the panel; the detail pane opens underneath.
 *
 * The panel's views render here as they do in the panel: the same elements,
 * fed what `timeline-view` would feed them. Only the connection is missing,
 * so the page says there is no host before anything asks for one, and the
 * panel's tokens and Web Awesome density go on this element rather than on
 * the page's `:root`.
 *
 * timeline-recording.json is a session from the playground (counter, list
 * and route clicks), read off `timeline-view` after recording.
 */
import {LitElement, css, html} from 'lit';
import {useNoHost} from '../client.js';
import {injectTokens} from '../../lib/tokens.js';
import {TimelineModel} from '../../lib/timeline/model.js';
import type {LayerState} from '../timeline-layers.js';
import type {TimelineEvent} from '../../types/timeline.js';
import '../wa-icons.js';
import '../timeline-tracks.js';
import recording from './timeline-recording.json';

useNoHost();
injectTokens({scope: 'timeline-figure', webAwesome: true});

const events = recording.events as TimelineEvent[];
const layers = recording.layers as LayerState[];
/** What `timeline-view` draws a lane for: captured layers that make events. */
const visibleTracks = layers
  .filter((l) => l.enabled && l.id !== 'lit-changed-values')
  .map((l) => l.id);

export class TimelineFigure extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 28rem;
      overflow: hidden;
      border: 1px solid var(--lit-devtools-border);
      background: var(--lit-devtools-bg);
      color: var(--lit-devtools-text);
    }
    timeline-tracks {
      flex: 1;
    }
  `;

  private _model = new TimelineModel();

  constructor() {
    super();
    this._model.setEvents(events);
  }

  override render() {
    const model = this._model;
    return html`<timeline-tracks
      .spans=${model.filteredSpans}
      .layers=${layers}
      .visibleTracks=${visibleTracks}
      .selectedKey=${model.selectedKey}
      .selectedSpan=${model.selectedSpan}
      .range=${model.range}
      .inspectable=${false}
      ?filtered=${events.length > 0}
      @span-select=${(e: CustomEvent<{key: string | null}>) => {
        model.select(e.detail.key);
        this.requestUpdate();
      }}
      @range-change=${(
        e: CustomEvent<{range: {start: number; end: number} | null}>
      ) => {
        model.setRange(e.detail.range?.start ?? null, e.detail.range?.end);
        this.requestUpdate();
      }}
      @range-filter=${() => {
        model.setFilter({range: model.range});
        this.requestUpdate();
      }}
      @element-filter=${(e: CustomEvent<{id: number}>) => {
        model.setFilter({elementId: e.detail.id});
        this.requestUpdate();
      }}
    ></timeline-tracks>`;
  }
}

customElements.define('timeline-figure', TimelineFigure);

declare global {
  interface HTMLElementTagNameMap {
    'timeline-figure': TimelineFigure;
  }
}
