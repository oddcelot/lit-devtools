import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import tw from './tailwind.css?css-sheet';
import {RenderCount} from './render-count';

/** A second card on the same sheet, to show what an edit elsewhere leaves alone. */
@customElement('tw-stat-card')
export class TwStatCard extends LitElement {
  static override styles = [tw];

  constructor() {
    super();
    new RenderCount(this);
  }

  override render() {
    return html`
      <section class="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
        <p class="m-0 text-sm text-slate-500">Programs written</p>
        <p class="my-2 text-4xl font-bold text-brand">1</p>
        <p class="text-sm text-slate-500">Note G, 1843</p>
        <p class="renders text-xs text-slate-500">renders: 0</p>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tw-stat-card': TwStatCard;
  }
}
