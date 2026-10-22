/**
 * `<timeline-figure mode="tracks|list">`: the panel's Timeline, live, over
 * the recording committed next to this file (see `recording.ts`), for pages
 * outside the panel: the docs' Timeline guide and the kitchen sink. Zoom,
 * pan, draw a range and select marks or rows as in the panel; the detail
 * pane opens underneath.
 *
 * The panel's views render here as they do in the panel: the same elements,
 * fed what `timeline-view` would feed them. Only the connection is missing,
 * so the page says there is no host before anything asks for one, and the
 * panel's tokens and Web Awesome density go on this element rather than on
 * the page's `:root`.
 */
import {LitElement, css, html} from 'lit';
import './no-host.js';
import {injectTokens} from '../../lib/tokens.js';
import {TimelineModel} from '../../lib/timeline/model.js';
import '../wa-icons.js';
import '../timeline-tracks.js';
import '../timeline-event-list.js';
import {events, layers, visibleTracks} from './recording.js';

injectTokens({scope: 'timeline-figure', webAwesome: true});

export class TimelineFigure extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 28rem;
      overflow: hidden;
      border: 1px solid var(--lit-devtools-border);
      background: var(--lit-devtools-bg);
      color: var(--lit-devtools-text);
    }
    timeline-tracks,
    timeline-event-list {
      flex: 1;
    }
  `;

  static override properties = {mode: {}};
  /** The Timeline's two presentations: `tracks` (the default) or `list`. */
  declare mode: 'tracks' | 'list';

  private _model = new TimelineModel();

  constructor() {
    super();
    this.mode = 'tracks';
    this._model.setEvents(events);
  }

  private _onSelect(e: CustomEvent<{key: string | null}>) {
    this._model.select(e.detail.key);
    this.requestUpdate();
  }

  private _onElementFilter(e: CustomEvent<{id: number}>) {
    this._model.setFilter({elementId: e.detail.id});
    this.requestUpdate();
  }

  override render() {
    const model = this._model;
    if (this.mode === 'list') {
      return html`<timeline-event-list
        .events=${events}
        .spans=${model.spans}
        .layers=${layers}
        .selectedKey=${model.selectedKey}
        .filter=${model.filter}
        .inspectable=${false}
        @span-select=${this._onSelect}
        @element-filter=${this._onElementFilter}
      ></timeline-event-list>`;
    }
    return html`<timeline-tracks
      .spans=${model.filteredSpans}
      .layers=${layers}
      .visibleTracks=${visibleTracks}
      .selectedKey=${model.selectedKey}
      .selectedSpan=${model.selectedSpan}
      .range=${model.range}
      .inspectable=${false}
      ?filtered=${events.length > 0}
      @span-select=${this._onSelect}
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
      @element-filter=${this._onElementFilter}
    ></timeline-tracks>`;
  }
}

customElements.define('timeline-figure', TimelineFigure);

declare global {
  interface HTMLElementTagNameMap {
    'timeline-figure': TimelineFigure;
  }
}
