import {css, html, type PropertyValues} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {FormControl, type FormValue} from './form-control';

/**
 * An on/off switch. Its `value` is a boolean. Like a checkbox, it submits
 * `on` when on and nothing when off, and `required` means it has to be on.
 *
 * There is no `<input>` inside. The host is the control: `ElementInternals`
 * gives it the `switch` role and `aria-checked` without sprouting attributes,
 * so an outside `<label for>` names it and clicking the label toggles it.
 *
 * Whether it is on is not reflected to an attribute. The page sees it as
 * `:state(checked)`, which is what the track below styles on.
 */
@customElement('fm-switch')
export class FmSwitch extends FormControl<boolean> {
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

  /** On at first; the `checked` attribute, as on a checkbox. */
  @property({type: Boolean, attribute: 'checked'}) defaultValue = false;

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
    if (!this.isDisabled) {
      this.commit(!this.value);
    }
  }

  protected toFormValue(on: boolean) {
    return on ? 'on' : null;
  }

  protected fromFormValue(value: FormValue) {
    return value !== null;
  }

  override updated(changed: PropertyValues<this>) {
    this.internals.ariaChecked = String(this.value);
    this.toggleState('checked', this.value);
    super.updated(changed);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fm-switch': FmSwitch;
  }
}
