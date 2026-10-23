/**
 * `<updates-figure component>`: the panel's Updates tab, live, over the
 * recording the figures share (see `recording.ts`), for pages outside the
 * panel: the docs' Updates guide and the kitchen sink. Click a component for
 * its updates, as in the panel; `component` (a tag name) opens with that
 * one's row selected, as a `#component=` link would.
 *
 * The view reads the panel's event buffer, so the recording goes into it
 * before the view subscribes; with no host behind it, it never looks for a
 * live one. The panel's tokens and Web Awesome density go on this element
 * rather than on the page's `:root`.
 */
import {LitElement, css, html} from 'lit';
import './no-host.js';
import {injectTokens} from '../../lib/token-text.js';
import {PanelLocation} from '../panel-location.js';
import {useRecordedEvents} from '../timeline-store.js';
import '../wa-icons.js';
import '../updates-view.js';
import {events} from './recording.js';

injectTokens({scope: 'updates-figure', webAwesome: true});
useRecordedEvents(events);

export class UpdatesFigure extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 30rem;
      border: 1px solid var(--lit-devtools-border);
      background: var(--lit-devtools-bg);
      color: var(--lit-devtools-text);
      font-family: var(--lit-devtools-font-sans);
    }
    updates-view {
      flex: 1;
      min-height: 0;
    }
  `;

  static override properties = {component: {}};
  /** The tag whose row to open with selected. */
  declare component: string | undefined;

  private _location = new PanelLocation('updates');

  override willUpdate(changed: Map<string, unknown>) {
    if (!changed.has('component')) return;
    // The view selects by element id, the first instance standing for its
    // tag's row; the recording knows which ids each tag had.
    const id = events.find((e) => e.meta?.tagName === this.component)?.meta
      ?.elementId;
    if (id !== undefined)
      this._location.apply({tab: 'updates', componentId: id});
  }

  override render() {
    return html`<updates-view .location=${this._location}></updates-view>`;
  }
}

customElements.define('updates-figure', UpdatesFigure);

declare global {
  interface HTMLElementTagNameMap {
    'updates-figure': UpdatesFigure;
  }
}
