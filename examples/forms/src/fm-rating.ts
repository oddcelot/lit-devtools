import {css, html, type PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {FormControl} from './form-control';

/**
 * A star rating from 1 to `max`. It submits the number, or nothing while no
 * star is picked; `required` makes that invalid with a message of its own,
 * since there is no native control here to borrow one from.
 *
 * The host is a `slider` for assistive tech: arrow keys, Home and End move
 * it, and an outside `<label for>` names it.
 *
 * States: `rated` once a star is picked, and `previewing` while the pointer
 * is over the stars, which dims the picked ones so the preview reads as one.
 */
@customElement('fm-rating')
export class FmRating extends FormControl {
  static override styles = css`
    :host {
      display: inline-flex;
      gap: 2px;
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      border-radius: 6px;
    }
    :host(:focus-visible) {
      outline: 2px solid var(--fm-accent, #5b4bdb);
      outline-offset: 2px;
    }
    :host(:disabled) {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .star {
      color: #c9c5d8;
      transition: color 100ms;
    }
    .star.on {
      color: #f2a516;
    }
    :host(:state(previewing)) .star.on {
      color: #f7c766;
    }
    :host(:state(user-invalid)) .star {
      color: #e7a3aa;
    }
  `;

  @property({type: Number}) value = 0;
  @property({type: Number}) max = 5;

  @state() private hovered = 0;

  constructor() {
    super();
    this.internals.role = 'slider';
    this.internals.ariaValueMin = '0';
    this.addEventListener('keydown', (event) => this.#onKey(event));
    this.addEventListener('pointerleave', () => (this.hovered = 0));
  }

  override render() {
    const shown = this.hovered || this.value;
    return Array.from({length: this.max}, (_, i) => {
      const n = i + 1;
      return html`<span
        class="star ${n <= shown ? 'on' : ''}"
        @pointerenter=${() => (this.hovered = this.isDisabled ? 0 : n)}
        @click=${() => this.#pick(n)}
        >★</span
      >`;
    });
  }

  #onKey(event: KeyboardEvent) {
    const next = {
      ArrowRight: this.value + 1,
      ArrowUp: this.value + 1,
      ArrowLeft: this.value - 1,
      ArrowDown: this.value - 1,
      Home: 1,
      End: this.max,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      this.#pick(Math.min(Math.max(next, 1), this.max));
    }
  }

  #pick(value: number) {
    if (this.isDisabled || value === this.value) {
      return;
    }
    this.value = value;
    this.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
    this.dispatchEvent(new Event('change', {bubbles: true}));
  }

  protected formValue() {
    return this.value > 0 ? String(this.value) : null;
  }

  protected restore(value: string | null) {
    this.value = Number(value ?? 0);
  }

  protected override validate() {
    return this.required && this.value === 0
      ? {
          flags: {valueMissing: true},
          message: 'Pick a rating.',
          anchor: this.renderRoot.querySelector<HTMLElement>('.star')!,
        }
      : {};
  }

  override updated(changed: PropertyValues<this>) {
    this.internals.ariaValueMax = String(this.max);
    this.internals.ariaValueNow = String(this.value);
    this.internals.ariaValueText =
      this.value > 0 ? `${this.value} of ${this.max} stars` : 'Not rated';
    this.internals.ariaRequired = String(this.required);
    this.internals.ariaDisabled = String(this.isDisabled);
    this.tabIndex = this.isDisabled ? -1 : 0;
    this.toggleState('rated', this.value > 0);
    this.toggleState('previewing', this.hovered > 0);
    super.updated(changed);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fm-rating': FmRating;
  }
}
