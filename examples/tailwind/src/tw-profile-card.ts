import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import tw from './tailwind.css?css-sheet';
import {RenderCount} from './render-count';

/**
 * Shadow, ring and gradient utilities. Tailwind builds each of them on custom
 * properties it registers with `@property`, which browsers ignore inside a
 * shadow root; the plugin registers them on the document, so they render.
 */
@customElement('tw-profile-card')
export class TwProfileCard extends LitElement {
  static override styles = [tw];

  constructor() {
    super();
    new RenderCount(this);
  }

  override render() {
    return html`
      <section class="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
        <div
          class="mb-4 size-14 rounded-full bg-linear-to-br from-brand to-pink-400 ring-4 ring-white shadow-md"
        ></div>
        <h2 class="m-0 text-lg font-semibold">Ada Lovelace</h2>
        <p class="text-sm text-slate-500">Analytical engine, first program</p>
        <button
          class="cursor-pointer rounded-lg border-0 bg-brand px-4 py-2 font-semibold text-white shadow-sm"
        >
          Follow
        </button>
        <p class="renders text-xs text-slate-500">renders: 0</p>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tw-profile-card': TwProfileCard;
  }
}
