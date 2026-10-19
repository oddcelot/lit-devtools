// The getters and methods that mirror a native control's API are for page
// code; nothing in this example happens to call them all.
// fallow-ignore-file unused-class-member
import {LitElement, type PropertyValues} from 'lit';
import {property, state} from 'lit/decorators.js';

/** What a control reports to `setValidity()`. Empty means valid. */
export interface Validity {
  flags?: ValidityStateFlags;
  message?: string;
  /** Where the browser points its validation bubble. */
  anchor?: HTMLElement;
}

/**
 * The form plumbing every control here shares. A subclass says what it
 * submits (`formValue()`), how to take a value back (`restore()`) and,
 * optionally, what makes it invalid (`validate()`). This class does the rest
 * through `ElementInternals`:
 *
 * - the value goes into the form's `FormData`;
 * - the validity blocks submit and shows the browser's bubble, and matches
 *   `:invalid` and `:valid` like a native control;
 * - a form reset puts the first value back, and a disabled `<fieldset>`
 *   disables the control (`:disabled` matches either way);
 * - the browser can restore the value on back/forward navigation;
 * - `setCustomValidity()` takes an error from outside, as on a native
 *   control, for rules about more than this one field.
 *
 * It also sets custom states, which match `:state()` in CSS from outside the
 * control (`fm-switch:state(checked)`) and inside it
 * (`:host(:state(checked))`):
 *
 * - `touched`: the control has lost focus, or a submit found it invalid;
 * - `dirty`: its value differs from the first one;
 * - `user-invalid`: touched and invalid, so errors wait until the user has
 *   been there. Native `:user-invalid` does not apply to custom elements.
 *
 * Subclasses add their own with `toggleState()`.
 */
export abstract class FormControl extends LitElement {
  static formAssociated = true;

  protected readonly internals = this.attachInternals();

  @property({reflect: true}) name = '';
  @property({type: Boolean, reflect: true}) disabled = false;
  @property({type: Boolean, reflect: true}) required = false;

  /** Disabled by its own attribute or by an ancestor `<fieldset>`. */
  @state() protected formDisabled = false;
  @state() private touched = false;
  /** Set by `setCustomValidity()`; `''` when there is none. */
  @state() protected customError = '';

  // `undefined` until the first update. On a hot patch that re-creates the
  // control, the plugin copies this field over before then, so the new
  // instance keeps the old one's starting point instead of taking its own.
  #initialValue?: string | null;

  constructor() {
    super();
    this.addEventListener('focusout', () => (this.touched = true));
    // A submit, `checkValidity()` or `reportValidity()` that finds the control
    // invalid fires `invalid` at it: show the error from then on.
    this.addEventListener('invalid', () => (this.touched = true));
  }

  /** The value `FormData` gets under `name`; `null` leaves it out. */
  protected abstract formValue(): string | null;

  /** Takes back a value `formValue()` returned, on reset or restore. */
  protected abstract restore(value: string | null): void;

  protected validate(): Validity {
    return {};
  }

  protected get isDisabled() {
    return this.disabled || this.formDisabled;
  }

  protected toggleState(name: string, on: boolean) {
    if (on) {
      this.internals.states.add(name);
    } else {
      this.internals.states.delete(name);
    }
  }

  get form() {
    return this.internals.form;
  }
  get labels() {
    return this.internals.labels;
  }
  get validity() {
    return this.internals.validity;
  }
  get validationMessage() {
    return this.internals.validationMessage;
  }
  get willValidate() {
    return this.internals.willValidate;
  }
  /**
   * An error the control can't see for itself, such as one from a rule
   * about several fields; `''` clears it. The control's own errors come
   * first, as on a native control's.
   */
  setCustomValidity(message: string) {
    this.customError = message;
  }
  checkValidity() {
    return this.internals.checkValidity();
  }
  reportValidity() {
    return this.internals.reportValidity();
  }

  override willUpdate(changed: PropertyValues<this>) {
    super.willUpdate(changed);
    if (this.#initialValue === undefined) {
      this.#initialValue = this.formValue();
    }
  }

  // After render, so `validate()` can read the shadow DOM it just drew.
  override updated(changed: PropertyValues<this>) {
    super.updated(changed);
    const value = this.formValue();
    this.internals.setFormValue(value);
    const {flags = {}, message = '', anchor} = this.validate();
    // Every one of the control's own errors has a message.
    if (message === '' && this.customError !== '') {
      this.internals.setValidity({customError: true}, this.customError, anchor);
    } else {
      this.internals.setValidity(flags, message, anchor);
    }
    this.toggleState('touched', this.touched);
    this.toggleState('dirty', value !== this.#initialValue);
    this.toggleState('user-invalid', this.touched && !this.validity.valid);
  }

  formResetCallback() {
    this.restore(this.#initialValue ?? null);
    this.touched = false;
  }

  formDisabledCallback(disabled: boolean) {
    this.formDisabled = disabled;
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    this.restore(typeof state === 'string' ? state : null);
  }
}
