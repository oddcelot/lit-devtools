// The getters and methods that mirror a native control's API are for page
// code; nothing in this example happens to call them all.
// fallow-ignore-file unused-class-member
import {LitElement, type PropertyValues} from 'lit';
import {property, state} from 'lit/decorators.js';

/**
 * What a control puts in the form: one string, several under its `name` (as
 * a `<select multiple>` does), or nothing.
 */
export type FormValue = string | readonly string[] | null;

/** What a control reports to `setValidity()`. No message means valid. */
export interface Validity {
  flags?: ValidityStateFlags;
  message?: string;
  /** Where the browser points its validation bubble. */
  anchor?: HTMLElement;
}

const isEmpty = (value: FormValue) =>
  value === null || value === '' || value.length === 0;

/**
 * The form plumbing every control here shares, over `ElementInternals`. A
 * subclass declares its `defaultValue` (usually from the `value` attribute)
 * and how its value goes into the form and back; this class does the rest:
 *
 * - `value` is the current value, `defaultValue` until someone changes it,
 *   as on a native `<input>`. A form reset goes back to the default;
 * - the value goes into the form's `FormData`, one entry per item for a list;
 * - `required` makes an empty value invalid, and `setCustomValidity()` takes
 *   an error from outside, such as a schema's (see `form-schema.ts`). Either
 *   blocks submit, shows the browser's bubble and matches `:invalid`;
 * - a disabled `<fieldset>` disables the control, and `:disabled` matches;
 * - the browser can restore the value on back/forward navigation.
 *
 * It sets custom states, which match `:state()` in CSS from outside the
 * control (`fm-switch:state(dirty)`) and inside it (`:host(:state(dirty))`):
 *
 * - `touched`: the control has lost focus, or a submit found it invalid;
 * - `dirty`: its value is not the default;
 * - `user-invalid`: touched and invalid, so errors wait until the user has
 *   been there. Native `:user-invalid` does not apply to custom elements.
 *
 * Subclasses add their own with `toggleState()`.
 */
export abstract class FormControl<T> extends LitElement {
  static formAssociated = true;

  protected readonly internals = this.attachInternals();

  @property({reflect: true}) name = '';
  @property({type: Boolean, reflect: true}) disabled = false;
  @property({type: Boolean, reflect: true}) required = false;

  /** The value a reset goes back to. */
  abstract defaultValue: T;

  // Unset until the value changes. Kept apart from `defaultValue`, which a
  // template sets, so a hot patch that re-creates the control carries it
  // over: the plugin leaves template-set properties to the template.
  @state() private current?: T;
  /** Disabled by its own attribute or by an ancestor `<fieldset>`. */
  @state() protected formDisabled = false;
  @state() private touched = false;
  @state() private customError = '';

  constructor() {
    super();
    this.addEventListener('focusout', () => (this.touched = true));
    // A submit or `reportValidity()` that finds the control invalid fires
    // `invalid` at it: show the error from then on.
    this.addEventListener('invalid', () => (this.touched = true));
  }

  get value(): T {
    return this.current ?? this.defaultValue;
  }
  set value(value: T) {
    this.current = value;
  }

  /** How `value` goes into the form; `null` or `[]` leaves it out. */
  protected abstract toFormValue(value: T): FormValue;

  /** How a form value comes back, when the browser restores the page. */
  protected abstract fromFormValue(value: FormValue): T;

  /** The control's own checks beyond `required`. */
  protected validate(): Validity {
    return {};
  }

  /** Sets the value as the user did: fires `input` and `change`. */
  protected commit(value: T) {
    this.value = value;
    this.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
    this.dispatchEvent(new Event('change', {bubbles: true}));
  }

  protected get isDisabled() {
    return this.disabled || this.formDisabled;
  }

  /** The current error, for a control that shows its own message. */
  protected get errorMessage() {
    return this.#validity().message ?? '';
  }

  protected toggleState(name: string, on: boolean) {
    if (on) {
      this.internals.states.add(name);
    } else {
      this.internals.states.delete(name);
    }
  }

  // The control's own errors come first, then `required`, then one set from
  // outside, as on a native control.
  #validity(): Validity {
    const own = this.validate();
    if (own.message) {
      return own;
    }
    if (this.required && isEmpty(this.toFormValue(this.value))) {
      return {flags: {valueMissing: true}, message: 'Fill this in.'};
    }
    if (this.customError) {
      return {flags: {customError: true}, message: this.customError};
    }
    return {};
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
  setCustomValidity(message: string) {
    this.customError = message;
  }
  checkValidity() {
    return this.internals.checkValidity();
  }
  reportValidity() {
    return this.internals.reportValidity();
  }

  // After render, so `validate()` can read the shadow DOM it just drew.
  override updated(changed: PropertyValues<this>) {
    super.updated(changed);
    const value = this.toFormValue(this.value);
    this.internals.setFormValue(this.#entries(value));
    const {flags = {}, message = '', anchor} = this.#validity();
    this.internals.setValidity(flags, message, anchor);
    this.internals.ariaRequired = String(this.required);
    this.internals.ariaDisabled = String(this.isDisabled);
    // A control that is its own focus target, rather than delegating focus
    // to something inside, needs a tab stop.
    if (!this.shadowRoot?.delegatesFocus) {
      this.tabIndex = this.isDisabled ? -1 : 0;
    }
    const initial = this.toFormValue(this.defaultValue);
    this.toggleState('touched', this.touched);
    this.toggleState(
      'dirty',
      JSON.stringify(value) !== JSON.stringify(initial)
    );
    this.toggleState('user-invalid', this.touched && !this.validity.valid);
  }

  // A list goes in as a FormData of its own, one entry per item; the form
  // appends those entries to its own.
  #entries(value: FormValue) {
    if (value === null || typeof value === 'string') {
      return value;
    }
    const data = new FormData();
    for (const item of value) {
      data.append(this.name, item);
    }
    return data;
  }

  formResetCallback() {
    this.current = undefined;
    this.touched = false;
  }

  formDisabledCallback(disabled: boolean) {
    this.formDisabled = disabled;
  }

  // The browser hands back what `setFormValue()` was given.
  formStateRestoreCallback(state: string | File | FormData | null) {
    this.current = this.fromFormValue(
      state instanceof FormData
        ? state.getAll(this.name).filter((item) => typeof item === 'string')
        : typeof state === 'string'
          ? state
          : null
    );
  }
}
