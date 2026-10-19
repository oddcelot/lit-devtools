import {css, html, type PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {FormControl, type FormValue} from './form-control';

/**
 * A star rating from 1 to `max`. Its `value` is the number of stars, 0 for
 * none; it submits the number, or nothing while no star is picked.
 *
 * The host is a `slider` for assistive tech: arrow keys, Home and End move
 * it, and an outside `<label for>` names it.
 *
 * States: `rated` once a star is picked, and `previewing` while the pointer
 * is over the stars, which dims the picked ones so the preview reads as one.
 */
@customElement('fm-rating')
export class FmRating extends FormControl<number> {
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

  /** Stars picked at first, from the `value` attribute; 0 for none. */
  @property({type: Number, attribute: 'value'}) defaultValue = 0;
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
    if (!this.isDisabled && value !== this.value) {
      this.commit(value);
    }
  }

  protected toFormValue(stars: number) {
    return stars > 0 ? String(stars) : null;
  }

  protected fromFormValue(value: FormValue) {
    return Number(value ?? 0);
  }

  override updated(changed: PropertyValues<this>) {
    this.internals.ariaValueMax = String(this.max);
    this.internals.ariaValueNow = String(this.value);
    this.internals.ariaValueText =
      this.value > 0 ? `${this.value} of ${this.max} stars` : 'Not rated';
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
