import {LitElement, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {navigation} from '../navigation.ts';
import ui from './ui.css?css-sheet';

/**
 * Says how the page it is on arrived: by a full load, or swapped in by a
 * view transition. The server can't know, so it says so until hydrated.
 */
@customElement('arrival-badge')
export class ArrivalBadge extends LitElement {
  static override styles = [ui];

  @state() private how?: 'load' | 'swap';

  override firstUpdated() {
    this.how = navigation.swapped ? 'swap' : 'load';
  }

  override render() {
    if (this.how === undefined) {
      return html`<span class="badge server">Not hydrated yet</span>`;
    }
    return html`<span class="badge hydrated"
      >${
        this.how === 'swap'
          ? 'This page was swapped in by a view transition'
          : 'This page came from a full load'
      }</span
    >`;
  }
}
