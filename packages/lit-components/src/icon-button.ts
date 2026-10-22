import WaButton from '@awesome.me/webawesome/dist/components/button/button.js';
import {property} from 'lit/decorators.js';
import type {PropertyValues} from 'lit';
import type {LitIcon} from './icon.js';
import './icon.js';

/**
 * An icon-only button: a Web Awesome button, neutral and plain at the design
 * system's small size, that draws `icon` and names itself with `label`.
 * Use it in toolbars and panel headers. Always pass `label`: it is the
 * button's accessible name.
 *
 * WA has no icon-only button, so `icon` and `label` are the two attributes
 * this adds; it keeps a `lit-icon` child in step with them. Everything else
 * is `wa-button`'s.
 */
export class LitIconButton extends WaButton {
  /** The icon's name, from the set icons.ts registers. */
  @property() icon = '';
  /** The accessible name, which is also what a tooltip should say. */
  @property() label = '';

  constructor() {
    super();
    this.variant = 'neutral';
    this.appearance = 'plain';
    this.size = 's';
  }

  override willUpdate(changed: PropertyValues<this>) {
    super.willUpdate(changed);
    if (changed.has('icon') || changed.has('label')) this._syncIcon();
  }

  private _syncIcon() {
    let icon = this.querySelector<LitIcon>(
      ':scope > lit-icon[data-icon-button]'
    );
    if (this.icon === '') {
      icon?.remove();
      return;
    }
    if (icon === null) {
      icon = document.createElement('lit-icon');
      icon.dataset['iconButton'] = '';
      this.append(icon);
    }
    icon.name = this.icon;
    icon.label = this.label;
  }
}

// Called directly: see button.ts.
customElements.define('lit-icon-button', LitIconButton);

declare global {
  interface HTMLElementTagNameMap {
    'lit-icon-button': LitIconButton;
  }
}
