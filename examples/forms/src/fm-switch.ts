import {css, html, type PropertyValues} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {FormControl} from './form-control';

/**
 * An on/off switch. Like a checkbox, it submits `value` when on and nothing
 * when off, and `required` means it has to be on.
 *
 * There is no `<input>` inside. The host is the control: `ElementInternals`
 * gives it the `switch` role and `aria-checked` without sprouting attributes,
 * so an outside `<label for>` names it and clicking the label toggles it.
 *
 * `checked` is not reflected to an attribute. The page sees it as
 * `:state(checked)`, which is what the track below styles on.
 */
@customElement('fm-switch')
export class FmSwitch extends FormControl {
  static override styles = css`
    :host {
      display: inline-block;
      cursor: pointer;
      border-radius: 999px;
    }
    :host(:focus-visible) {
      outline: 2px solid var(--fm-accent, #5b4bdb);
      outline-offset: 2px;
    }
    :host(:disabled) {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .track {
      display: block;
      width: 40px;
      height: 22px;
      padding: 2px;
      box-sizing: border-box;
      border-radius: 999px;
      background: #c9c5d8;
      transition: background 150ms;
    }
    .thumb {
      display: block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
      transition: translate 150ms;
    }
    :host(:state(checked)) .track {
      background: var(--fm-accent, #5b4bdb);
    }
    :host(:state(checked)) .thumb {
      translate: 18px;
    }
    :host(:state(user-invalid)) .track {
      outline: 2px solid #c62f3d;
    }
  `;

  @property({type: Boolean}) checked = false;
  @property() value = 'on';

  constructor() {
    super();
    this.internals.role = 'switch';
    this.addEventListener('click', () => this.#toggle());
    this.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        this.#toggle();
      }
    });
  }

  override render() {
    return html`<span class="track"><span class="thumb"></span></span>`;
  }

  #toggle() {
    if (this.isDisabled) {
      return;
    }
    this.checked = !this.checked;
    this.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
    this.dispatchEvent(new Event('change', {bubbles: true}));
  }

  protected formValue() {
    return this.checked ? this.value : null;
  }

  protected restore(value: string | null) {
    this.checked = value !== null;
  }

  protected override validate() {
    return this.required && !this.checked
      ? {flags: {valueMissing: true}, message: 'Switch this on to continue.'}
      : {};
  }

  override updated(changed: PropertyValues<this>) {
    this.internals.ariaChecked = String(this.checked);
    this.internals.ariaRequired = String(this.required);
    this.internals.ariaDisabled = String(this.isDisabled);
    this.tabIndex = this.isDisabled ? -1 : 0;
    this.toggleState('checked', this.checked);
    super.updated(changed);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fm-switch': FmSwitch;
  }
}
