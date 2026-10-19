import {LitElement, css, html, type PropertyValues} from 'lit';
import {customElement, property, query} from 'lit/decorators.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {live} from 'lit/directives/live.js';
import {FormControl} from './form-control';

/**
 * A labelled text input. The `<input>` inside does the validating
 * (`required`, `type="email"`, `minlength`) and the control passes its
 * verdict on to the form, so the browser's own messages show up.
 *
 * The label is drawn inside: an outside `<label for>` would name the host,
 * but focus lands on the inner `<input>`, which would have no name.
 *
 * States: `empty`, plus the base class's `touched`, `dirty` and
 * `user-invalid`, which shows the error line below.
 */
@customElement('fm-text-field')
export class FmTextField extends FormControl {
  // Clicking the host, or its outside label, focuses the inner `<input>`.
  static override shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static override styles = css`
    :host {
      display: grid;
      gap: 4px;
    }
    label {
      font-weight: 600;
    }
    input {
      font: inherit;
      padding: 8px 10px;
      border: 1px solid #c9c5d8;
      border-radius: 6px;
      background: white;
    }
    input:focus-visible {
      outline: 2px solid var(--fm-accent, #5b4bdb);
      outline-offset: 1px;
    }
    :host(:state(user-invalid)) input {
      border-color: #c62f3d;
      background: #fff5f6;
    }
    .error {
      margin: 0;
      font-size: 0.875em;
      color: #c62f3d;
    }
    :host(:not(:state(user-invalid))) .error {
      display: none;
    }
  `;

  @property() label = '';
  @property() value = '';
  @property() type: 'text' | 'email' = 'text';
  @property() placeholder = '';
  @property({type: Number}) minlength?: number;

  @query('input') private input!: HTMLInputElement;

  override render() {
    return html`
      <label for="input">${this.label}</label>
      <input
        id="input"
        type=${this.type}
        .value=${live(this.value)}
        placeholder=${this.placeholder}
        minlength=${ifDefined(this.minlength)}
        ?required=${this.required}
        ?disabled=${this.isDisabled}
        @input=${() => (this.value = this.input.value)}
        @change=${this.#redispatch}
      />
      <p class="error">${this.input?.validationMessage}</p>
    `;
  }

  // `input` is composed and reaches the page on its own; `change` is not.
  #redispatch() {
    this.dispatchEvent(new Event('change', {bubbles: true}));
  }

  protected formValue() {
    return this.value;
  }

  protected restore(value: string | null) {
    this.value = value ?? '';
  }

  protected override validate() {
    return {
      flags: this.input.validity,
      message: this.input.validationMessage,
      anchor: this.input,
    };
  }

  override updated(changed: PropertyValues<this>) {
    this.toggleState('empty', this.value === '');
    super.updated(changed);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fm-text-field': FmTextField;
  }
}
