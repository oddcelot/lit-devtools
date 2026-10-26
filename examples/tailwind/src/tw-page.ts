import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import tw from './tailwind.css?css-sheet';
import {RenderCount} from './render-count';
import './tw-profile-card';
import './tw-stat-card';

/**
 * The page: a heading and two cards. Every component adopts the same
 * Tailwind sheet, so there is one `CSSStyleSheet` for all three shadow roots.
 */
@customElement('tw-page')
export class TwPage extends LitElement {
  static override styles = [tw];

  constructor() {
    super();
    new RenderCount(this);
  }

  override render() {
    return html`
      <main class="mx-auto max-w-3xl p-8 font-sans text-slate-800">
        <h1 class="m-0 text-3xl font-bold text-brand">Tailwind, shared</h1>
        <p class="max-w-xl leading-relaxed text-slate-600">
          One Tailwind sheet, adopted by every shadow root on the page. Each
          component counts its renders.
        </p>
        <span class="renders text-xs text-slate-500">renders: 0</span>
        <div class="mt-6 grid gap-6 sm:grid-cols-2">
          <tw-profile-card></tw-profile-card>
          <tw-stat-card></tw-stat-card>
        </div>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tw-page': TwPage;
  }
}
