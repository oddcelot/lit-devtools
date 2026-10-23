/**
 * `<timeline-figure mode="tracks|list" event range raw>`: the panel's
 * Timeline, live, over the recording committed next to this file (see
 * `recording.ts`), for pages outside the panel: the docs' Timeline guides
 * and the kitchen sink. Zoom, pan, draw a range and select marks or rows as
 * in the panel; the detail pane opens underneath.
 *
 * It can open in the state a passage describes, with what a deep link
 * carries: `event` selects the span holding that recorded event (its `id`
 * in the recording, as `#event=` names it), or with `raw` the event's own
 * row, and scrolls the list to it;
 * `range` (`start-end` in ms, as `#range=`) draws that range and zooms the
 * tracks to it; `raw` turns the list's Raw switch on.
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
import {rawRow, TimelineModel} from '../../lib/timeline/model.js';
import {parseRangeParam} from '../../lib/timeline/range.js';
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

  static override properties = {
    mode: {},
    event: {},
    range: {},
    raw: {type: Boolean},
  };
  /** The Timeline's two presentations: `tracks` (the default) or `list`. */
  declare mode: 'tracks' | 'list';
  /** A recorded event's id: open with the span holding it selected. */
  declare event: string | undefined;
  /** `start-end` in ms: open with that range drawn, the tracks zoomed to it. */
  declare range: string | undefined;
  /** Open the list with Raw on. */
  declare raw: boolean;

  private _model = new TimelineModel();

  constructor() {
    super();
    this.mode = 'tracks';
    this.raw = false;
    this._model.setEvents(events);
  }

  /** Set by `willUpdate` when `event` or `range` moved the view, so
   *  `updated` can bring it into sight once the view has rendered. */
  private _reveal = false;

  override willUpdate(changed: Map<string, unknown>) {
    if (!changed.has('range') && !changed.has('event')) return;
    // The range first: drawing one drops the span selection.
    const range = parseRangeParam(this.range ?? '');
    this._model.setRange(range?.start ?? null, range?.end);
    if (this.event !== undefined) this._selectEvent(this.event);
    this._reveal = range !== null || this.event !== undefined;
  }

  override updated() {
    if (!this._reveal) return;
    this._reveal = false;
    const view = this.renderRoot.querySelector<
      HTMLElement & {updateComplete: Promise<unknown>}
    >('timeline-tracks, timeline-event-list');
    // After the view's own update, as `timeline-view` does: the list pins
    // itself to the newest row when its events arrive. The list lays out its
    // rows only once it is on screen, and a figure further down a page is
    // not yet, so it reveals the row when it first comes into view.
    void view?.updateComplete.then(() => {
      if (this.mode === 'list')
        void this._whenVisible().then(() => this._list?.reveal());
      else this._tracks?.zoomToRange();
    });
  }

  /** Resolves the first time any of the figure is in the viewport. */
  private _whenVisible(): Promise<void> {
    return new Promise((resolve) => {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(this);
    });
  }

  /** With Raw on, rows are single events, keyed apart from the spans. */
  private _selectEvent(id: string) {
    if (!this.raw) {
      this._model.selectEvent(id);
      return;
    }
    const index = events.findIndex((e) => e.id === id);
    this._model.select(index === -1 ? null : rawRow(events[index]!, index).key);
  }

  private get _list() {
    return this.renderRoot.querySelector('timeline-event-list');
  }

  private get _tracks() {
    return this.renderRoot.querySelector('timeline-tracks');
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
        .raw=${this.raw}
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
