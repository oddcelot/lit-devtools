/**
 * Custom element for the HMR update indicator.
 * Injected by the Vite plugin as an external module so that
 * `import.meta.hot` is available.
 */

import {INDICATOR_HTML} from './indicator-template.js';
import {subscribeOverrideKeys} from './overrides.js';
import type {ViteHotLike} from './page-channel.js';
import {observeEdgeInsets} from './edge-panel.js';
import {injectTokens} from '../token-text.js';

/** One entry of a Vite `vite:afterUpdate` payload. */
interface ViteUpdate {
  type?: string;
  path?: string;
  acceptedPath?: string;
}

/**
 * True when an HMR batch is purely a stylesheet swap — every update is either
 * a `css-update` or a `js-update` whose accepted module is a `.css` source
 * (the shared-sheet queries `?css-sheet`/`?raw`/`?url` all accept a `.css`
 * path). Such a batch restyles adopted sheets in place with no re-render.
 *
 * Heuristic: keyed on the accepted path ending in `.css`. Robust for this
 * plugin's own queries; a user hand-wiring `import.meta.hot.accept` on a raw
 * `.css` would also read as a style swap, which is the intended grouping. An
 * empty/missing payload can't be classified, so it counts as a re-render
 * rather than being silently dropped.
 */
function isStyleSwap(data: unknown): boolean {
  const updates = (data as {updates?: ViteUpdate[]} | undefined)?.updates;
  if (!Array.isArray(updates) || updates.length === 0) return false;
  return updates.every((u) => {
    if (u.type === 'css-update') return true;
    if (u.type === 'js-update') {
      return (u.acceptedPath ?? u.path ?? '').split('?')[0].endsWith('.css');
    }
    return false;
  });
}

class LitDevtoolsIndicator extends HTMLElement {
  #initialized = false;
  #count = 0;
  #container: HTMLElement;
  #countEl: HTMLElement | null = null;

  constructor() {
    super();
    const root = this.attachShadow({mode: 'closed'});
    root.innerHTML = INDICATOR_HTML;
    this.#container = root.getElementById('container')!;
    this.#countEl = root.querySelector('.count');
    this.#setCount(this.hasAttribute('count'));
  }

  /** Show/hide the cumulative update count (and the at-rest opacity). */
  #setCount(enabled: boolean) {
    this.#container.classList.toggle('with-count', enabled);
  }

  connectedCallback() {
    if (this.#initialized) return;
    this.#initialized = true;
    injectTokens();
    const hot = (import.meta as {hot?: ViteHotLike}).hot;
    hot?.on('vite:afterUpdate', (data) => {
      // Count only updates that actually re-render/re-execute a component;
      // a pure shared-stylesheet swap (?css-sheet / ?raw / ?url adopted sheet)
      // restyles in place without re-rendering, so it pulses but doesn't count.
      const styleSwap = isStyleSwap(data);
      if (!styleSwap && this.#countEl !== null) {
        this.#countEl.textContent = String(++this.#count);
      }
      this.#container.classList.toggle('style-swap', styleSwap);
      this.#container.classList.remove('active');
      void this.#container.offsetWidth;
      this.#container.classList.add('active');
    });
    // Let the DevTools panel hide/show the indicator and its count live (and
    // across reloads).
    subscribeOverrideKeys(hot, {
      hmrIndicatorVisible: (v) => (this.style.display = v ? '' : 'none'),
      hmrIndicatorCount: (v) => this.#setCount(v),
    });
    // Stay clear of the Vite DevTools edge panel.
    observeEdgeInsets((insets) => {
      this.style.setProperty('--edge-top', `${insets.top}px`);
      this.style.setProperty('--edge-right', `${insets.right}px`);
      this.style.setProperty('--edge-bottom', `${insets.bottom}px`);
      this.style.setProperty('--edge-left', `${insets.left}px`);
    });
  }
}

customElements.define('lit-devtools-hmr-indicator', LitDevtoolsIndicator);
