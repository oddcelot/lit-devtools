import {LitElement, css, html, type PropertyValues} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {FormControl, type FormValue, type Validity} from './form-control';

/** `value="garden, coffee"` in markup; a `Set` everywhere else. */
const tagList = {
  fromAttribute: (value: string | null): ReadonlySet<string> =>
    new Set(
      (value ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  toAttribute: (value: ReadonlySet<string>) => [...value].join(', '),
};

/**
 * A set of tags: type one and press Enter or comma, remove one with its ×
 * or Backspace in the empty input.
 *
 * `value` is a `ReadonlySet<string>`, so a tag can't be added twice. It is
 * replaced, never mutated, so Lit sees every change: assign a new set.
 *
 * As on a native `<input>`, the `value` attribute is the default
 * (`defaultValue`) and the `value` property the current tags. Keeping them
 * apart also lets a hot patch of the page keep the tags someone added: the
 * plugin leaves a property the template sets to the template, and carries
 * the rest over.
 * The form gets one entry per tag under `name`, as from a
 * `<select multiple>`, so `formData.getAll('tags')` reads them back.
 *
 * States: `empty` with no tags, `full` at `max`, which hides the input, plus
 * the base class's. Like the text field, its error line is the `error` part.
 */
@customElement('fm-tags')
export class FmTags extends FormControl {
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
    .box {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px;
      border: 1px solid #c9c5d8;
      border-radius: 6px;
      background: white;
    }
    .box:focus-within {
      outline: 2px solid var(--fm-accent, #5b4bdb);
      outline-offset: 1px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 4px 2px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--fm-accent, #5b4bdb) 12%, white);
      color: var(--fm-accent, #5b4bdb);
    }
    .tag button {
      font: inherit;
      border: 0;
      padding: 0 6px;
      border-radius: 999px;
      background: none;
      color: inherit;
      cursor: pointer;
    }
    input {
      flex: 1;
      min-width: 8em;
      font: inherit;
      border: 0;
      padding: 4px;
      outline: none;
    }
    :host(:state(full)) input {
      display: none;
    }
    :host(:state(user-invalid)) .box {
      border-color: #c62f3d;
      background: #fff5f6;
    }
    .hint,
    .error {
      margin: 0;
      font-size: 0.875em;
    }
    .hint {
      color: #6a6680;
    }
    .error {
      color: #c62f3d;
    }
    :host(:not(:state(user-invalid))) .error {
      display: none;
    }
  `;

  @property() label = '';
  @property({attribute: 'value', converter: tagList})
  defaultValue: ReadonlySet<string> = new Set();
  @property({type: Number}) max = Infinity;
  @property() placeholder = '';

  /** Unset until someone changes the tags, so it follows `defaultValue`. */
  @state() private current?: ReadonlySet<string>;

  get value(): ReadonlySet<string> {
    return this.current ?? this.defaultValue;
  }
  set value(value: ReadonlySet<string>) {
    this.current = value;
  }

  @query('input') private input!: HTMLInputElement;

  override render() {
    return html`
      <label for="input">${this.label}</label>
      <div class="box">
        ${[...this.value].map(
          (tag) => html`
            <span class="tag">
              ${tag}
              <button
                type="button"
                aria-label="Remove ${tag}"
                ?disabled=${this.isDisabled}
                @click=${() => this.#remove(tag)}
              >
                ×
              </button>
            </span>
          `
        )}
        <input
          id="input"
          placeholder=${this.placeholder}
          ?disabled=${this.isDisabled}
          @keydown=${this.#onKey}
          @blur=${() => this.#add(this.input.value)}
        />
      </div>
      ${
        Number.isFinite(this.max)
          ? html`<p class="hint">${this.value.size} of ${this.max}</p>`
          : ''
      }
      <p class="error" part="error">
        ${this.validate().message || this.customError}
      </p>
    `;
  }

  #onKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.#add(this.input.value);
    } else if (event.key === 'Backspace' && this.input.value === '') {
      const last = [...this.value].at(-1);
      if (last !== undefined) {
        this.#remove(last);
      }
    }
  }

  #add(text: string) {
    const tag = text.trim();
    this.input.value = '';
    if (tag === '' || this.value.has(tag) || this.value.size >= this.max) {
      return;
    }
    this.#set(new Set([...this.value, tag]));
  }

  #remove(tag: string) {
    const next = new Set(this.value);
    next.delete(tag);
    this.#set(next);
    // The × that had focus is gone; keep it in the field.
    this.input.focus();
  }

  #set(value: ReadonlySet<string>) {
    this.value = value;
    this.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
    this.dispatchEvent(new Event('change', {bubbles: true}));
  }

  protected formValue() {
    return [...this.value];
  }

  protected restore(value: FormValue) {
    this.value = new Set(typeof value === 'string' ? [value] : (value ?? []));
  }

  protected override validate(): Validity {
    return this.required && this.value.size === 0
      ? {
          flags: {valueMissing: true},
          message: 'Add at least one tag.',
          anchor: this.input,
        }
      : {};
  }

  override updated(changed: PropertyValues<this>) {
    this.toggleState('empty', this.value.size === 0);
    this.toggleState('full', this.value.size >= this.max);
    super.updated(changed);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fm-tags': FmTags;
  }
}
